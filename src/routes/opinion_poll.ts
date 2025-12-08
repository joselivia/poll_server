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
  type: 'multi-choice'| 'single-choice' | 'open-ended' | 'yes-no-notsure' | 'rating' | 'ranking';
  questionText: string;
  options?: Option[];
  isCompetitorQuestion?: boolean;
}

interface PollData {
  id: number;
  title: string;
  category: string;
  presidential: string | null;
  createdAt: string;
  competitors: Competitor[];
  questions: Question[];
}

interface AggregatedResponse {
  questionId: number;
  questionText: string;
  type: 'single-choice'| 'multi-choice' | 'open-ended' | 'yes-no-notsure' | 'rating' | 'ranking';
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
  averageRating?: number; 
  ratingValues?: number;
  rankingData?: any[];
}

interface DemographicsData {
  gender: { label: string; count: number; percentage: number; }[];
  ageRanges: { label: string; count: number; percentage: number; }[];
  totalRespondents: number;
}
router.post("/:pollId/vote", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  const {
    userIdentifier,
    responses,
    respondentName,
    respondentAge,
    respondentGender,
     region,
    county,
    constituency,
    ward,
  } = req.body;

  // === Basic validation ===
  if (
    isNaN(pollId) ||
    !userIdentifier ||
    !Array.isArray(responses) ||
    responses.length === 0
  ) {
    return res.status(400).json({ message: "Invalid or missing data." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    for (const r of responses) {
      if (r.type === "ranking" && Array.isArray(r.selectedOptionIds)) {
        for (let rank = 0; rank < r.selectedOptionIds.length; rank++) {
          const optionId = r.selectedOptionIds[rank];

          await client.query(
            `INSERT INTO poll_rankings 
             (poll_id, question_id, option_id, voter_id, rank_position)
             VALUES ($1, $2, $3, $4, $5)`,
            [pollId, r.questionId, optionId, userIdentifier, rank + 1]
          );
        }
      }
    }
    const selectedOptionIds: number[] = [];
    const selectedCompetitorIds: number[] = [];
    const openEndedResponses: { questionId: number; response: string }[] = [];
    const ratingResponses: { questionId: number; rating: number }[] = [];

    for (const r of responses) {
      // Skip ranking — already saved above
      if (r.type === "ranking") continue;

      // Single-choice, multi-choice
      if (r.selectedOptionIds !== undefined && r.selectedOptionIds !== null) {
        const ids = Array.isArray(r.selectedOptionIds)
          ? r.selectedOptionIds
          : [r.selectedOptionIds];
        selectedOptionIds.push(...ids);
      }

      // Competitor selection
      if (r.selectedCompetitorIds !== undefined && r.selectedCompetitorIds !== null) {
        const ids = Array.isArray(r.selectedCompetitorIds)
          ? r.selectedCompetitorIds
          : [r.selectedCompetitorIds];
        selectedCompetitorIds.push(...ids);
      }

      // Open-ended
      if (r.openEndedResponse?.trim()) {
        openEndedResponses.push({
          questionId: r.questionId,
          response: r.openEndedResponse.trim(),
        });
      }

      // Rating
      if (typeof r.rating === "number" && r.rating >= 1 && r.rating <= 10) {
        ratingResponses.push({
          questionId: r.questionId,
          rating: r.rating,
        });
      }
      
    }
    await client.query(
      `
      INSERT INTO poll_responses (
        poll_id, user_identifier,
        selected_option_ids, selected_competitor_ids,
        open_ended_responses, rating,
        respondent_name, respondent_age, respondent_gender,
        region, county, constituency, ward
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        pollId,
        userIdentifier,
        selectedOptionIds.length > 0 ? selectedOptionIds : null,
        selectedCompetitorIds.length > 0 ? selectedCompetitorIds : null,
        openEndedResponses.length > 0 ? openEndedResponses : null,
ratingResponses.length > 0 ? ratingResponses : null,
            respondentName || null,
        respondentAge ? parseInt(respondentAge, 10) : null,
        respondentGender || null,
        region || null,
        county || null,
        constituency || null,
        ward || null,
      ]
    );

    await client.query("COMMIT");
    return res.status(201).json({ message: "Vote submitted successfully!" });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Vote submission failed:", error);
    return res
      .status(500)
      .json({ message: error.message || "Failed to submit vote." });
  } finally {
    client.release();
  }
});

router.get("/:pollId/results", async (req, res) => {
  const pollId = parseInt(req.params.pollId);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

let { county, constituency, ward } = req.query;
if (Array.isArray(county)) county = county[0];
if (Array.isArray(constituency)) constituency = constituency[0];
if (Array.isArray(ward)) ward = ward[0];

let filterQuery = `WHERE poll_id = $1`;
let params: (string | number)[] = [pollId];
let index = 2;

if (county) {
  filterQuery += ` AND county = $${index++}`;
  params.push(String(county));
}

if (constituency) {
  filterQuery += ` AND constituency = $${index++}`;
  params.push(String(constituency));
}

if (ward) {
  filterQuery += ` AND ward = $${index++}`;
  params.push(String(ward));
}


  try {
    const pollResult = await pool.query(
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
          scale: q.scale ?? 0,
        }));

    const formattedPollData: PollData = {
      id: pollData.id,
      title: pollData.title,
      category: pollData.category,
      presidential: pollData.presidential,
       createdAt: pollData.created_at,
        competitors: formattedCompetitors,
      questions: formattedQuestions,
    };
// Get ALL possible locations for this poll (unfiltered)
const locationResult = await pool.query(
  `SELECT DISTINCT region, county, constituency, ward
   FROM poll_responses
   WHERE poll_id = $1`,
  [pollId]
);

    const responsesResult = await pool.query(
      `SELECT user_identifier, selected_competitor_ids, selected_option_ids, open_ended_responses,rating, respondent_gender, respondent_age,ward, constituency, county, region
       FROM poll_responses
       ${filterQuery}`,
      params
    );

    const allResponses = responsesResult.rows; 

    const aggregatedResponses: AggregatedResponse[] = [];

for (const question of formattedPollData.questions) {
  const isCompetitor = question.isCompetitorQuestion === true;

  const optionCounts = new Map<number, number>();
  const competitorCounts = new Map<number, number>();
  const openEnded: string[] = [];
  let ratingValues: number[] = [];
const respondentsWhoAnsweredThisQuestion = new Set<string>();
  // Process all responses for this question
  for (const r of allResponses) {
    const user = String(r.user_identifier);
let answeredThisQuestion = false;
// 1. Single/Multi choice
  if (!isCompetitor && Array.isArray(r.selected_option_ids) && r.selected_option_ids.length > 0) {
    const hasOptionFromThisQuestion = r.selected_option_ids.some((id: number) =>
      question.options?.some(o => o.id === id)
    );
    if (hasOptionFromThisQuestion) {
      answeredThisQuestion = true;
      // Also count the actual votes
      r.selected_option_ids.forEach((id: number) => {
        if (question.options?.some(o => o.id === id)) {
          optionCounts.set(id, (optionCounts.get(id) || 0) + 1);
        }
      });
    }
  }
// 2. Competitor questions
  if (isCompetitor && Array.isArray(r.selected_competitor_ids) && r.selected_competitor_ids.length > 0) {
    answeredThisQuestion = true;
    r.selected_competitor_ids.forEach((id: number) => {
      competitorCounts.set(id, (competitorCounts.get(id) || 0) + 1);
    });
  }

// 3. Open-ended
  if (question.type === "open-ended" && Array.isArray(r.open_ended_responses)) {
    const match = r.open_ended_responses.find((item: any) => 
      item?.questionId === question.id && item?.response?.trim()
    );
    if (match) {
      answeredThisQuestion = true;
      openEnded.push(match.response);
    }
  }

// 4. Rating
  if (question.type === "rating" && Array.isArray(r.rating)) {
    const match = r.rating.find((item: any) => 
      item?.questionId === question.id && item.rating != null
    );
    if (match) {
      answeredThisQuestion = true;
      ratingValues.push(Number(match.rating));
    }
  }
if (answeredThisQuestion) {
    respondentsWhoAnsweredThisQuestion.add(user);
  }
  }

  // === HANDLE RANKING QUESTIONS EXCLUSIVELY ===
  if (question.type === "ranking") {
    const rankingQuery = await pool.query(`
      SELECT 
        po.id,
        po.option_text AS label,
        pr.rank_position,
        COUNT(*) AS count
      FROM poll_rankings pr
      JOIN poll_options po ON pr.option_id = po.id
      WHERE pr.poll_id = $1 AND pr.question_id = $2
      GROUP BY po.id, po.option_text, pr.rank_position
      ORDER BY pr.rank_position ASC, count DESC
    `, [pollId, question.id]);

    const rankingsByPosition = new Map<number, { id: number; label: string; count: number }[]>();

    for (const row of rankingQuery.rows) {
      const pos = parseInt(row.rank_position);
      if (!rankingsByPosition.has(pos)) rankingsByPosition.set(pos, []);
      rankingsByPosition.get(pos)!.push({
        id: parseInt(row.id),
        label: row.label,
        count: parseInt(row.count),
      });
    }

    const sortedRankings = Array.from(rankingsByPosition.entries())
      .map(([position, options]) => ({
        position,
        options: options.sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => a.position - b.position);


    aggregatedResponses.push({
      questionId: question.id,
      questionText: question.questionText,
      type: "ranking",
      totalResponses:respondentsWhoAnsweredThisQuestion.size,
      rankingData: sortedRankings,
    });

    continue; // ← THIS IS THE KEY! Skip the rest of the loop
  }

  const aggregated: AggregatedResponse = {
    questionId: question.id,
    questionText: question.questionText,
    type: question.type,
    isCompetitorQuestion: isCompetitor,
    totalResponses: respondentsWhoAnsweredThisQuestion.size,
  };

  // Handle choices (single/multi/competitor)
  if (optionCounts.size > 0 || competitorCounts.size > 0) {
    const counts = optionCounts.size > 0 ? optionCounts : competitorCounts;
    const totalSelections = Array.from(counts.values()).reduce((a, b) => a + b, 0);

    aggregated.choices = Array.from(counts.entries()).map(([id, count]) => {
      let label = "Unknown";
      if (optionCounts.has(id)) {
        label = question.options?.find(o => o.id === id)?.optionText ?? `Option ${id}`;
      } else if (competitorCounts.has(id)) {
        label = formattedPollData.competitors.find(c => c.id === id)?.name ?? `Competitor ${id}`;
      }
      return {
        id,
        label,
        count,
        percentage: totalSelections > 0 ? Number(((count / totalSelections) * 100).toFixed(2)) : 0,
      };
    });

    aggregated.totalSelections = totalSelections;
  }

  // Rating
  if (question.type === "rating" && ratingValues.length > 0) {
    const average = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
    aggregated.averageRating = Number(average.toFixed(2));
  }

  // Open-ended
  if (question.type === "open-ended") {
    aggregated.openEndedResponses = openEnded;
  }

  // Push ONLY for non-ranking questions
  aggregatedResponses.push(aggregated);
}
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
  location: locationResult.rows,
    });

  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ message: "Internal server error while fetching poll results." });
  } 
});
router.delete("/:id", async (req, res) => {
  const pollId = parseInt(req.params.id);
  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  try {
   const pollCheck = await pool.query(
      "SELECT id FROM polls WHERE id = $1",
      [pollId]
    );
   if (pollCheck.rows.length === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ message: "Poll not found." });
    }
    await pool.query(
      "DELETE FROM poll_competitors WHERE poll_id = $1",
      [pollId]
    );

    // Delete the poll (cascades everything: questions, options, responses)
    await pool.query("DELETE FROM polls WHERE id = $1", [pollId]);

    return res.status(200).json({ message: "Poll deleted successfully." });
  } catch (err) {
    console.error("Error deleting poll:", err);
    return res.status(500).json({ message: "Server error." });
  }
});


// router.put("/:id/publish", async (req, res) => {
//   const { id } = req.params;
//   const { published } = req.body; 
//   try {
//     const result = await pool.query(
//       "UPDATE polls SET published = $1 WHERE id = $2 RETURNING *",
//       [published, id]
//     );

//     if (result.rowCount === 0) {
//       return res.status(404).json({ message: "Poll not found" });
//     }

//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error("Error updating publish status:", error);
//     res.status(500).json({ message: "Failed to update publish status" });
//   }
// });
// router.get("/published", async (req, res) => {
  
//   try {
//     const result = await pool.query(
//       `SELECT 
//   published, 
//   voting_expires_at, 
//   created_at
// FROM 
// WHERE published = true
// ORDER BY created_at DESC
//     `
//     );
//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).json({ message: "Failed to fetch published polls" });
//   }
// });
export default router;