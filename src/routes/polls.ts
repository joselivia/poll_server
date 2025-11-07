import express from "express";
import multer from "multer";
import { pool } from "../config-db"; 
import { PoolClient } from 'pg'; 

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

interface Competitor {
  id: number;
  name: string;
  party: string;
  profileImage: Buffer | string | null; 
}

interface Option {
  id: number;
  optionText: string;
}

interface Question {
  id: number;
  type: 'single-choice' | 'open-ended' | 'yes-no-notsure';
  questionText: string;
  options?: Option[];
  isCompetitorQuestion?: boolean;
}

interface PollData {
  id: number;
  title: string;
  category: string;
  presidential: string | null;
  region: string;
  county: string;
  constituency: string;
  ward: string;
  createdAt: string;
  voting_expires_at: string | null;
  competitors: Competitor[];
  questions: Question[];
}

interface AggregatedResponse {
  questionId: number;
  questionText: string;
  type: 'single-choice' | 'open-ended' | 'yes-no-notsure';
  isCompetitorQuestion?: boolean;
  totalResponses: number;
  choices?: {
    id: number | string;
    label: string;
    count: number;
    percentage: number;
  }[];
  openEndedResponses?: string[];
}

interface DemographicsData {
  gender: { label: string; count: number; percentage: number; }[];
  ageRanges: { label: string; count: number; percentage: number; }[];
  totalRespondents: number;
}

router.post("/", async (req, res) => {
  const {
    title,
    category,
    presidential,
    region,
    county,
    constituency,
    ward,
    voting_expires_at
  } = req.body;

  if (!title || !category || !region) {
    return res.status(400).json({ message: "Missing required fields for poll creation." });
  }

  let expiry = null;
  if (voting_expires_at) {
    expiry = new Date(voting_expires_at);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ message: "Invalid voting_expires_at format." });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO polls (title, category, presidential, region, county, constituency, ward, voting_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [title, category, presidential, region, county || "All", constituency || "All", ward || "All", expiry]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ message: "Server error during poll creation." });
  }
});



router.post("/createQuiz", upload.any(), async (req, res) => {
  const { pollId } = req.body;

  if (!pollId) {
    return res.status(400).json({ message: "Poll ID is missing. Cannot add quiz details without an existing poll." });
  }

  let client: PoolClient | null = null; 
  try {
    const mainCompetitors = JSON.parse(req.body.mainCompetitors);
    const dynamicPollQuestions = JSON.parse(req.body.dynamicPollQuestions);

    client = await pool.connect();
    await client.query("BEGIN"); 

    const pollExists = await client.query(`SELECT id FROM polls WHERE id = $1`, [pollId]);
    if (pollExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Poll not found for the provided ID." });
    }

    for (let i = 0; i < mainCompetitors.length; i++) {
      const { name, party } = mainCompetitors[i];
      const file = Array.isArray(req.files) ? req.files.find(f => f.fieldname === `mainProfile-${i}`) : undefined;
      const profileBuffer = file ? file.buffer : null;
      await client.query(
        `INSERT INTO poll_competitors (poll_id, name, party, profile_image) VALUES ($1, $2, $3, $4)`,
        [pollId, name, party || null, profileBuffer]
      );
    }

    for (const q of dynamicPollQuestions) {
      const { type, questionText, options, isCompetitorQuestion } = q;
      const questionInsert = await client.query(
        `INSERT INTO poll_questions (poll_id, type, question_text,is_competitor_question) VALUES ($1, $2, $3, $4) RETURNING id`,
        [pollId, type, questionText, isCompetitorQuestion === true]
      );

      const questionId = questionInsert.rows[0].id;
      if (type === "single-choice" || type === "yes-no-notsure") {
        for (const opt of options) {
          await client.query(
            `INSERT INTO poll_options (question_id, option_text) VALUES ($1, $2)`,
            [questionId, opt]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Quiz details saved successfully for poll.", pollId: pollId });
  } catch (error) {
    if (client) { 
      await client.query("ROLLBACK");
    }
    console.error("Transaction or unexpected error:", error);
    res.status(500).json({ message: "Failed to save quiz details." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*
      FROM polls p
      WHERE EXISTS (
        SELECT 1 FROM poll_questions q 
        WHERE q.poll_id = p.id AND q.is_competitor_question = false
      )
      ORDER BY p.created_at DESC
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching polls:", error);
    res.status(500).json({ message: "Server error." });
  }
});




router.get("/:id", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID" });
  }

  let client: PoolClient | null = null; 
  try {
    client = await pool.connect();

    const pollResult = await client.query(
      `SELECT id, title, category, presidential, region, county, constituency, ward,voting_expires_at, created_at FROM polls WHERE id = $1`,
      [pollId]
    );
    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    const competitors = await client.query(
      `SELECT id, name, party, encode(profile_image, 'base64') AS profile_base64
       FROM poll_competitors WHERE poll_id = $1 ORDER BY id`, 
      [pollId]
    );

    const questionsRes = await client.query(
      `SELECT id, type, question_text,is_competitor_question FROM poll_questions WHERE poll_id = $1 ORDER BY id`, 
      [pollId]
    );

    const questions = [];
    for (const q of questionsRes.rows) {
      let options: { id: number; optionText: string }[] = [];

      if (q.type === "single-choice" || q.type === "yes-no-notsure") {
        const opts = await client.query(
          `SELECT id, option_text FROM poll_options WHERE question_id = $1 ORDER BY id`, 
          [q.id]
        );
        options = opts.rows.map((opt: { id: number; option_text: string }) => ({ id: opt.id, optionText: opt.option_text }));
      }

      questions.push({
        id: q.id,
        type: q.type,
        questionText: q.question_text,
        options,
        isCompetitorQuestion: q.is_competitor_question === true,
      });
    }

    return res.json({
      id: pollResult.rows[0].id,
      title: pollResult.rows[0].title,
      category: pollResult.rows[0].category,
      presidential: pollResult.rows[0].presidential,
      region: pollResult.rows[0].region,
      county: pollResult.rows[0].county,
      constituency: pollResult.rows[0].constituency,
      ward: pollResult.rows[0].ward,
      votingExpiresAt: pollResult.rows[0].voting_expires_at,
      createdAt: pollResult.rows[0].created_at,
      competitors: competitors.rows.map((row: { id: number; name: string; party: string; profile_base64: string | null; }) => ({
        id: row.id, 
        name: row.name,
        party: row.party,
        profileImage: row.profile_base64
          ? `data:image/png;base64,${row.profile_base64}`
          : null,
      })),
      questions,
    });
  } catch (error) {
    console.error("Error fetching poll:", error);
    return res.status(500).json({ message: "Server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post("/:pollId/vote", async (req, res) => {
  const pollId = parseInt(req.params.pollId);
  const { userIdentifier, responses, respondentName, respondentAge, respondentGender } = req.body;
  if (isNaN(pollId) || !userIdentifier || !Array.isArray(responses) || responses.length === 0 || !respondentName || !respondentAge || !respondentGender) {
    return res.status(400).json({ message: "Missing respondent details or responses." });
  }

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN"); 

    for (const response of responses) {
      const { questionId, selectedCompetitorId, selectedOptionId, openEndedResponse } = response;

      const questionCheck = await client.query(
        `SELECT id, type FROM poll_questions WHERE id = $1 AND poll_id = $2`,
        [questionId, pollId]
      );
      if (questionCheck.rows.length === 0) {
        throw new Error(`Question ID ${questionId} not found for poll ${pollId}.`);
      }
      const questionType = questionCheck.rows[0].type;

      if (questionType === 'open-ended') {
        if (typeof openEndedResponse !== 'string' || openEndedResponse.trim() === '') {
          throw new Error(`Open-ended response missing or invalid for question ID ${questionId}.`);
        }
        await client.query(
          `INSERT INTO poll_responses (poll_id, user_identifier, question_id, open_ended_response, respondent_name, respondent_age, respondent_gender)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [pollId, userIdentifier, questionId, openEndedResponse.trim(), respondentName, respondentAge, respondentGender]
        );
      } else if (questionType === 'single-choice' || questionType === 'yes-no-notsure') {
        if (selectedCompetitorId) {
          const competitorCheck = await client.query(
            `SELECT id FROM poll_competitors WHERE id = $1 AND poll_id = $2`,
            [selectedCompetitorId, pollId]
          );
          if (competitorCheck.rows.length === 0) {
            throw new Error(`Competitor ID ${selectedCompetitorId} not found for poll ${pollId}.`);
          }
          await client.query(
            `INSERT INTO poll_responses (poll_id, user_identifier, question_id, selected_competitor_id, respondent_name, respondent_age, respondent_gender)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [pollId, userIdentifier, questionId, selectedCompetitorId, respondentName, respondentAge, respondentGender]
          );
        } else if (selectedOptionId) {
          const optionCheck = await client.query(
            `SELECT id FROM poll_options WHERE id = $1 AND question_id = $2`,
            [selectedOptionId, questionId]
          );
          if (optionCheck.rows.length === 0) {
            throw new Error(`Option ID ${selectedOptionId} not found for question ID ${questionId}.`);
          }
          await client.query(
            `INSERT INTO poll_responses (poll_id, user_identifier, question_id, selected_option_id, respondent_name, respondent_age, respondent_gender)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [pollId, userIdentifier, questionId, selectedOptionId, respondentName, respondentAge, respondentGender]
          );
        } else {
          throw new Error(`No valid selection for question ID ${questionId} (single-choice/yes-no).`);
        }
      } else {
        throw new Error(`Unsupported question type for question ID ${questionId}: ${questionType}`);
      }
    }

    await client.query("COMMIT"); 
    res.status(201).json({ message: "Votes submitted successfully." });
  } catch (error: any) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("Vote submission transaction error:", error);
    res.status(500).json({ message: error.message || "Failed to submit votes." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get("/:pollId/results", async (req, res) => {
  const pollId = parseInt(req.params.pollId);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  let client: PoolClient | null = null; 
  try {
    client = await pool.connect();
    const pollResult = await client.query(
      `SELECT
          p.id, p.title, p.category, p.presidential, p.region, p.county, p.constituency, p.ward, p.created_at,
          json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'party', c.party, 'profileImage', encode(c.profile_image, 'base64'))) AS competitors,
          json_agg(DISTINCT jsonb_build_object('id', q.id, 'type', q.type, 'questionText', q.question_text, 'options', (SELECT json_agg(jsonb_build_object('id', o.id, 'optionText', o.option_text)) FROM poll_options o WHERE o.question_id = q.id), 'isCompetitorQuestion', q.is_competitor_question)) AS questions
        FROM polls p
        LEFT JOIN poll_competitors c ON p.id = c.poll_id -- Corrected JOIN alias to 'c'
        LEFT JOIN poll_questions q ON p.id = q.poll_id   -- Corrected JOIN alias to 'q'
        WHERE p.id = $1
        GROUP BY p.id
      `,
      [pollId]
    );

    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found." });
    }
    const pollData = pollResult.rows[0];

    const formattedCompetitors = pollData.competitors[0] === null ? [] : pollData.competitors.map((comp: any) => ({
      id: comp.id,
      name: comp.name,
      party: comp.party,
      profileImage: comp.profileImage ? `data:image/png;base64,${comp.profileImage}` : null,
    }));

    const formattedQuestions = pollData.questions[0] === null ? [] : pollData.questions.map((q: any) => ({
      id: q.id,
      type: q.type,
      questionText: q.questionText,
      options: q.options ? q.options.map((o: any) => ({ id: o.id, optionText: o.optionText })) : [],
      isCompetitorQuestion: q.isCompetitorQuestion,
    }));


    const formattedPollData: PollData = {
      id: pollData.id,
      title: pollData.title,
      category: pollData.category,
      presidential: pollData.presidential,
      region: pollData.region,
      county: pollData.county,
      constituency: pollData.constituency,
      ward: pollData.ward,
      createdAt: pollData.created_at,
      voting_expires_at:pollData.voting_expires_at,
      competitors: formattedCompetitors,
      questions: formattedQuestions,
    };

    const responsesResult = await client.query(
      `SELECT question_id, selected_competitor_id, selected_option_id, open_ended_response, respondent_gender, respondent_age
       FROM poll_responses
       WHERE poll_id = $1`,
      [pollId]
    );
    const allResponses = responsesResult.rows;

    const aggregatedResponses: AggregatedResponse[] = [];
    for (const question of formattedPollData.questions) {
      const questionResponses = allResponses.filter(r => r.question_id === question.id);
      const totalResponsesForQuestion = questionResponses.length;

      let aggregatedQuestion: AggregatedResponse = {
        questionId: question.id,
        questionText: question.questionText,
        type: question.type,
        isCompetitorQuestion: question.isCompetitorQuestion,
        totalResponses: totalResponsesForQuestion,
      };

      if (question.type === 'open-ended') {
        aggregatedQuestion.openEndedResponses = questionResponses
          .map(r => r.open_ended_response)
          .filter(Boolean); 
      } else if (question.isCompetitorQuestion) {
        const choiceCounts = new Map<number, number>(); 
        questionResponses.forEach(r => {
          if (r.selected_competitor_id !== null) {
            choiceCounts.set(r.selected_competitor_id, (choiceCounts.get(r.selected_competitor_id) || 0) + 1);
          }
        });

        aggregatedQuestion.choices = Array.from(choiceCounts.entries()).map(([id, count]) => {
          const competitor = formattedPollData.competitors.find((comp: Competitor) => comp.id === id); 
          return {
            id,
            label: competitor ? competitor.name : `Unknown Competitor ${id}`,
            count,
            percentage: totalResponsesForQuestion > 0 ? (count / totalResponsesForQuestion) * 100 : 0,
          };
        });
      } else if (question.type === 'single-choice' || question.type === 'yes-no-notsure') {
        const choiceCounts = new Map<number, number>();
        questionResponses.forEach(r => {
          if (r.selected_option_id !== null) {
            choiceCounts.set(r.selected_option_id, (choiceCounts.get(r.selected_option_id) || 0) + 1);
          }
        });

        aggregatedQuestion.choices = Array.from(choiceCounts.entries()).map(([id, count]) => {
          const option = question.options?.find((opt: Option) => opt.id === id); 
          return {
            id,
            label: option ? option.optionText : `Unknown Option ${id}`,
            count,
            percentage: totalResponsesForQuestion > 0 ? (count / totalResponsesForQuestion) * 100 : 0,
          };
        });
      }
      aggregatedResponses.push(aggregatedQuestion);
    }

    const totalRespondents = new Set(allResponses.map(r => r.respondent_id)).size;
    const genderCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>(); 

    allResponses.forEach(r => {
      if (r.respondent_gender) {
        const gender = r.respondent_gender;
        genderCounts.set(gender, (genderCounts.get(gender) || 0) + 1);
      }
      if (r.respondent_age) {
        const age = parseInt(r.respondent_age);
        let ageRange: string;
        if (age >= 18 && age <= 24) ageRange = '18-24';
        else if (age >= 25 && age <= 34) ageRange = '25-34';
        else if (age >= 35 && age <= 44) ageRange = '35-44';
        else if (age >= 45 && age <= 54) ageRange = '45-54';
        else if (age >= 55 && age <= 64) ageRange = '55-64';
        else if (age >= 65 && age <= 74) ageRange = '65-74';
        else ageRange = '75+';
        ageCounts.set(ageRange, (ageCounts.get(ageRange) || 0) + 1);
      }
    });

    const demographics: DemographicsData = {
      gender: Array.from(genderCounts.entries()).map(([label, count]) => ({
        label,
        count,
        percentage: totalRespondents > 0 ? (count / totalRespondents) * 100 : 0,
      })),
      ageRanges: Array.from(ageCounts.entries()).map(([label, count]) => ({
        label,
        count,
        percentage: totalRespondents > 0 ? (count / totalRespondents) * 100 : 0,
      })).sort((a, b) => { 
        const order = ['18-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75+'];
        return order.indexOf(a.label) - order.indexOf(b.label);
      }),
      totalRespondents: totalRespondents,
    };


    res.status(200).json({
      poll: formattedPollData,
      aggregatedResponses: aggregatedResponses,
      demographics: demographics,
    });

  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ message: "Internal server error while fetching poll results." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

export default router;