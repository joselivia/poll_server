import express from "express";
import { pool } from "../config-db";
const router = express.Router();

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
  type: 'multi-choice'| 'single-choice' | 'open-ended' | 'yes-no-notsure';
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
  type: 'single-choice'| 'multi-choice' | 'open-ended' | 'yes-no-notsure';
  isCompetitorQuestion?: boolean;
  totalResponses: number;
  choices?: {
    id: number | string;
    label: string;
    count: number;
    percentage: number;
  }[];
  openEndedResponses?: string[];
   totalSelections?: number; 
}

interface DemographicsData {
  gender: { label: string; count: number; percentage: number; }[];
  ageRanges: { label: string; count: number; percentage: number; }[];
  totalRespondents: number;
}
router.post("/:pollId/vote", async (req, res) => {
  const pollId = parseInt(req.params.pollId);
  const { userIdentifier, responses, respondentName, respondentAge, respondentGender } = req.body;
  if (isNaN(pollId) || !userIdentifier || !Array.isArray(responses) || responses.length === 0 || !respondentGender) {
    return res.status(400).json({ message: "Missing respondent details or responses." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); 

for (const response of responses) {
  const {
    questionId,
    selectedCompetitorId,
    selectedOptionId,
    selectedCompetitorIds,
    selectedOptionIds,
    openEndedResponse,
  } = response;

  const questionCheck = await client.query(
    `SELECT id, type FROM poll_questions WHERE id = $1 AND poll_id = $2`,
    [questionId, pollId]
  );

  if (questionCheck.rows.length === 0) {
    throw new Error(`Question ID ${questionId} not found for poll ${pollId}.`);
  }

  const questionType = questionCheck.rows[0].type;

  // 🟩 OPEN-ENDED
if (questionType === "open-ended") {
  await client.query(`
    INSERT INTO poll_responses (
      poll_id, user_identifier, question_id, open_ended_response,
      respondent_name, respondent_age, respondent_gender,
      region, county, constituency, ward
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  `, [
    pollId,
    userIdentifier,
    questionId,
    openEndedResponse,
    respondentName,
    respondentAge,
    respondentGender,
    req.body.region,
    req.body.county,
    req.body.constituency,
    req.body.ward
  ]);
}


  // 🟦 CHOICE-BASED: single, multi, or yes-no-notsure
  else if (
    questionType === "single-choice" ||
    questionType === "multi-choice" ||
    questionType === "yes-no-notsure"
  ) {
    // normalize input (for single choice → treat as an array)
    const optionIds = selectedOptionIds || (selectedOptionId ? [selectedOptionId] : null);
    const competitorIds = selectedCompetitorIds || (selectedCompetitorId ? [selectedCompetitorId] : []);

    if (optionIds.length === 0 && competitorIds.length === 0) {
      throw new Error(`No valid selection for question ID ${questionId}.`);
    }

    // ✅ handle selected options
await client.query(`
  INSERT INTO poll_responses (
    poll_id, user_identifier, question_id,
    selected_option_ids, open_ended_response,
    respondent_name, respondent_age, respondent_gender,
    region, county, constituency, ward
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
`, [
  pollId,
  userIdentifier,
  questionId,
  optionIds,
  openEndedResponse || null,
  respondentName,
  respondentAge,
  respondentGender,
  req.body.region,
  req.body.county,
  req.body.constituency,
  req.body.ward
]);



    // ✅ handle selected competitors
    for (const competitorId of competitorIds) {
      const competitorCheck = await client.query(
        `SELECT id FROM poll_competitors WHERE id = $1 AND poll_id = $2`,
        [competitorId, pollId]
      );
      if (competitorCheck.rows.length === 0) {
        throw new Error(`Competitor ID ${competitorId} not found for poll ${pollId}.`);
      }

await client.query(`
  INSERT INTO poll_responses (
    poll_id, user_identifier, question_id,
    selected_competitor_id,
    respondent_name, respondent_age, respondent_gender,
    region, county, constituency, ward
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
`, [
  pollId,
  userIdentifier,
  questionId,
  selectedCompetitorId,
  respondentName,
  respondentAge,
  respondentGender,
  req.body.region,
  req.body.county,
  req.body.constituency,
  req.body.ward
]);

    }
  }

  else {
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
  const client = await pool.connect();
  try {
    const pollResult = await client.query(
      `SELECT
          p.id, p.title, p.category, p.presidential, p.region, p.county, p.constituency, p.ward, p.created_at, p.voting_expires_at,
          json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'party', c.party, 'profileImage', encode(c.profile_image, 'base64'))) AS competitors,
          json_agg(DISTINCT jsonb_build_object(
            'id', q.id,
            'type', q.type,
            'questionText', q.question_text,
            'options', (SELECT json_agg(jsonb_build_object('id', o.id, 'optionText', o.option_text)) FROM poll_options o WHERE o.question_id = q.id),
            'isCompetitorQuestion', q.is_competitor_question
          )) AS questions
        FROM polls p
        LEFT JOIN poll_competitors c ON p.id = c.poll_id
        LEFT JOIN poll_questions q ON p.id = q.poll_id
        WHERE p.id = $1
        GROUP BY p.id
      `,
      [pollId]
    );

    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found." });
    }

    const pollData = pollResult.rows[0];

    const formattedCompetitors = (!pollData.competitors || pollData.competitors[0] === null)
      ? []
      : pollData.competitors.map((comp: any) => ({
          id: comp.id,
          name: comp.name,
          party: comp.party,
          profileImage: comp.profileImage ? `data:image/png;base64,${comp.profileImage}` : null,
        }));

    const formattedQuestions = (!pollData.questions || pollData.questions[0] === null)
      ? []
      : pollData.questions.map((q: any) => ({
          id: q.id,
          type: q.type,
          questionText: q.questionText,
          options: q.options ? q.options.map((o: any) => ({ id: o.id, optionText: o.optionText })) : [],
          isCompetitorQuestion: q.isCompetitorQuestion === true,
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
      voting_expires_at: pollData.voting_expires_at,
      competitors: formattedCompetitors,
      questions: formattedQuestions,
    };

    const responsesResult = await client.query(
      `SELECT user_identifier, question_id, selected_competitor_id, selected_option_id, open_ended_response, respondent_gender, respondent_age
       FROM poll_responses
       WHERE poll_id = $1`,
      [pollId]
    );

    const allResponses = responsesResult.rows; 

    const aggregatedResponses: AggregatedResponse[] = [];

    for (const question of formattedPollData.questions) {
// Filter responses for the current question, ensuring type consistency
const questionResponses = allResponses.filter(
  (r: any) => Number(r.question_id) === Number(question.id)
);

// Count unique respondents by converting identifiers to strings
const uniqueRespondents = new Set(
  questionResponses.map((r: any) => String(r.user_identifier))
).size;

      const aggregatedQuestion: AggregatedResponse = {
        questionId: question.id,
        questionText: question.questionText,
        type: question.type,
        isCompetitorQuestion: question.isCompetitorQuestion,
        totalResponses: uniqueRespondents,
      };

      if (question.type === "open-ended") {
        aggregatedQuestion.openEndedResponses = questionResponses
          .map((r: any) => r.open_ended_response)
          .filter(Boolean);
      } else {
        // build counts
        const optionCounts = new Map<number, number>();
        const competitorCounts = new Map<number, number>();

        questionResponses.forEach((r: any) => {
          if (r.selected_option_id !== null && r.selected_option_id !== undefined) {
            const id = Number(r.selected_option_id);
            optionCounts.set(id, (optionCounts.get(id) || 0) + 1);
          }
          if (r.selected_competitor_id !== null && r.selected_competitor_id !== undefined) {
            const id = Number(r.selected_competitor_id);
            competitorCounts.set(id, (competitorCounts.get(id) || 0) + 1);
          }
        });

        // ----- OPTIONS (single / multi / yes-no) -----
        if (optionCounts.size > 0) {
      
if (question.type === "multi-choice") {
  const totalSelections = Array.from(optionCounts.values()).reduce((a, b) => a + b, 0);

  aggregatedQuestion.choices = Array.from(optionCounts.entries()).map(([id, count]) => {
    const option = question.options?.find((opt: Option) => opt.id === id);
    return {
      id,
      label: option ? option.optionText : `Option ${id}`,
      count,
      percentage: totalSelections > 0 ? (count / totalSelections) * 100 : 0,
    };
  });

  aggregatedQuestion.totalSelections = totalSelections;
}
 else {
            // single-choice or yes-no-notsure => percent of unique respondents
            aggregatedQuestion.choices = Array.from(optionCounts.entries()).map(([id, count]) => {
              const option = question.options?.find((opt: Option) => opt.id === id);
              const percentage = uniqueRespondents > 0 ? (count / uniqueRespondents) * 100 : 0;
              return {
                id,
                label: option ? option.optionText : `Option ${id}`,
                count,
                percentage: Number(percentage.toFixed(2)),
              };
            }).sort((a, b) => b.count - a.count);
          }
        }

        // ----- COMPETITOR QUESTIONS -----
        if (competitorCounts.size > 0) {
          // Decide denominator: if competitorSelections > uniqueRespondents treat like multi-select; otherwise treat like single-select (per-user)
          const totalCompetitorSelections = Array.from(competitorCounts.values()).reduce((a, b) => a + b, 0);
          const useSelectionsAsDenominator = totalCompetitorSelections > uniqueRespondents;

          aggregatedQuestion.choices = Array.from(competitorCounts.entries()).map(([id, count]) => {
            const competitor = formattedPollData.competitors.find((c: Competitor) => c.id === id);
            const label = competitor ? competitor.name : `Competitor ${id}`;
            const denom = useSelectionsAsDenominator ? totalCompetitorSelections : uniqueRespondents;
            const percentage = denom > 0 ? (count / denom) * 100 : 0;
            return {
              id,
              label,
              count,
              percentage: Number(percentage.toFixed(2)),
            };
          }).sort((a, b) => b.count - a.count);
        }
      }

      aggregatedResponses.push(aggregatedQuestion);
    }

    // overall demographics (across poll)
    const totalRespondents = new Set(allResponses.map((r: any) => r.user_identifier)).size;
    const genderCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>();

    allResponses.forEach((r: any) => {
      if (r.respondent_gender) {
        const g = String(r.respondent_gender);
        genderCounts.set(g, (genderCounts.get(g) || 0) + 1);
      }
      if (r.respondent_age) {
        const age = parseInt(r.respondent_age, 10);
        let ageRange = "75+";
        if (!isNaN(age)) {
          if (age >= 18 && age <= 24) ageRange = "18-24";
          else if (age >= 25 && age <= 34) ageRange = "25-34";
          else if (age >= 35 && age <= 44) ageRange = "35-44";
          else if (age >= 45 && age <= 54) ageRange = "45-54";
          else if (age >= 55 && age <= 64) ageRange = "55-64";
          else if (age >= 65 && age <= 74) ageRange = "65-74";
        }
        ageCounts.set(ageRange, (ageCounts.get(ageRange) || 0) + 1);
      }
    });

    const demographics: DemographicsData = {
      gender: Array.from(genderCounts.entries()).map(([label, count]) => ({
        label,
        count,
        percentage: totalRespondents > 0 ? Number(((count / totalRespondents) * 100).toFixed(2)) : 0,
      })),
      ageRanges: Array.from(ageCounts.entries()).map(([label, count]) => ({
        label,
        count,
        percentage: totalRespondents > 0 ? Number(((count / totalRespondents) * 100).toFixed(2)) : 0,
      })).sort((a, b) => {
        const order = ["18-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"];
        return order.indexOf(a.label) - order.indexOf(b.label);
      }),
      totalRespondents,
    };

    res.status(200).json({
      poll: formattedPollData,
      aggregatedResponses,
      demographics,

    });

  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ message: "Internal server error while fetching poll results." });
  } finally {
    if (client) client.release();
  }
});

export default router;