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
  county;
  if (Array.isArray(constituency)) constituency = constituency[0];
  if (Array.isArray(ward)) ward = ward[0];

  let filterQuery = `WHERE poll_id = $1`;
  let params: any[] = [pollId];
  let index = 2;

  if (county) { filterQuery += ` AND county = $${index++}`; params.push(county); }
  if (constituency) { filterQuery += ` AND constituency = $${index++}`; params.push(constituency); }
  if (ward) { filterQuery += ` AND ward = $${index++}`; params.push(ward); }

  try {
    // === 1. Load Poll + Questions + Competitors ===
    const pollResult = await pool.query(
      `SELECT
          p.id, p.title, p.category, p.presidential, p.region, p.county, p.constituency, p.ward, p.created_at,
          json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'party', c.party, 'profileImage', encode(c.profile_image, 'base64'))) FILTER (WHERE c.id IS NOT NULL) AS competitors,
          json_agg(DISTINCT jsonb_build_object(
            'id', q.id,
            'type', q.type,
            'questionText', q.question_text,
            'options', (SELECT json_agg(jsonb_build_object('id', o.id, 'optionText', o.option_text)) FROM poll_options o WHERE o.question_id = q.id),
            'isCompetitorQuestion', q.is_competitor_question
          )) FILTER (WHERE q.id IS NOT NULL) AS questions
        FROM polls p
        LEFT JOIN poll_competitors c ON p.id = c.poll_id
        LEFT JOIN poll_questions q ON p.id = q.poll_id
        WHERE p.id = $1
        GROUP BY p.id`,
      [pollId]
    );

    if (pollResult.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found." });
    }

    const pollData = pollResult.rows[0];

    const formattedCompetitors = pollData.competitors?.[0] === null ? [] : pollData.competitors.map((c: any) => ({
      id: c.id,
      name: c.name,
      party: c.party,
      profileImage: c.profileImage ? `data:image/png;base64,${c.profileImage}` : null,
    }));

    const formattedQuestions = pollData.questions?.[0] === null ? [] : pollData.questions.map((q: any) => ({
      id: q.id,
      type: q.type,
      questionText: q.questionText,
      options: q.options || [],
      isCompetitorQuestion: !!q.isCompetitorQuestion,
      scale: q.scale ?? 5,
    }));

    const formattedPollData = {
      id: pollData.id,
      title: pollData.title,
      category: pollData.category,
      presidential: pollData.presidential,
      createdAt: pollData.created_at,
      competitors: formattedCompetitors,
      questions: formattedQuestions,
    };

    // === 2. Load Responses ===
    const locationResult = await pool.query(
      `SELECT DISTINCT region, county, constituency, ward FROM poll_responses WHERE poll_id = $1`,
      [pollId]
    );

    const responsesResult = await pool.query(
      `SELECT 
         user_identifier,
         selected_option_ids,
         selected_competitor_ids,
         open_ended_responses,
         rating,
         respondent_gender,
         respondent_age
       FROM poll_responses
       ${filterQuery}`,
      params
    );

    const allResponses = responsesResult.rows;

    // Parse PostgreSQL array strings into JavaScript arrays
    allResponses.forEach((r: any) => {
      // Parse selected_option_ids
      if (typeof r.selected_option_ids === 'string') {
        r.selected_option_ids = r.selected_option_ids
          .replace(/[{}]/g, '')
          .split(',')
          .map((id: string) => parseInt(id.trim(), 10))
          .filter((id: number) => !isNaN(id));
      }
      
      // Parse selected_competitor_ids
      if (typeof r.selected_competitor_ids === 'string') {
        r.selected_competitor_ids = r.selected_competitor_ids
          .replace(/[{}]/g, '')
          .split(',')
          .map((id: string) => parseInt(id.trim(), 10))
          .filter((id: number) => !isNaN(id));
      }
      
      // Parse open_ended_responses (PostgreSQL array of JSON strings)
      if (typeof r.open_ended_responses === 'string') {
        try {
          // Remove outer braces and split by quoted strings
          const arrayContent = r.open_ended_responses.replace(/^{|}$/g, '');
          if (arrayContent.trim()) {
            // Match quoted JSON strings within the array
            const jsonStrings = arrayContent.match(/"(?:[^"\\]|\\.)*"/g) || [];
            r.open_ended_responses = jsonStrings.map((str: string) => {
              try {
                // Remove outer quotes and parse the JSON
                const unquoted = str.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                return JSON.parse(unquoted);
              } catch (e) {
                return null;
              }
            }).filter((item: any) => item !== null);
          } else {
            r.open_ended_responses = [];
          }
        } catch (e) {
          r.open_ended_responses = [];
        }
      }
      
      // Parse rating (PostgreSQL array of JSON objects or simple array)
      if (typeof r.rating === 'string') {
        try {
          // Remove outer braces and split by quoted strings for JSON objects
          const arrayContent = r.rating.replace(/^{|}$/g, '');
          if (arrayContent.trim()) {
            // Check if it contains JSON objects (has quotes)
            if (arrayContent.includes('"')) {
              const jsonStrings = arrayContent.match(/"(?:[^"\\]|\\.)*"/g) || [];
              r.rating = jsonStrings.map((str: string) => {
                try {
                  const unquoted = str.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                  return JSON.parse(unquoted);
                } catch (e) {
                  return null;
                }
              }).filter((item: any) => item !== null);
            } else {
              // Simple numeric array
              r.rating = arrayContent.split(',')
                .map((n: string) => parseFloat(n.trim()))
                .filter((n: number) => !isNaN(n));
            }
          } else {
            r.rating = [];
          }
        } catch (e) {
          r.rating = [];
        }
      }
    });

    // Total number of people who voted at all (used as fallback)
    const totalUniqueVoters = new Set(allResponses.map(r => String(r.user_identifier))).size;

    const aggregatedResponses: any[] = [];

    // === 3. Process Each Question ===
    for (const question of formattedQuestions) {
      const optionCounts = new Map<number, number>();
      const competitorCounts = new Map<number, number>();
      const openEnded: string[] = [];
      const ratingValues: number[] = [];
      const answeredUsers = new Set<string>();

      for (const r of allResponses) {
        const userId = String(r.user_identifier);
        let answered = false;

        // === CHOICE-BASED QUESTIONS (single/multi/yes-no-notsure) ===
        if (["single-choice", "multi-choice", "yes-no-notsure"].includes(question.type)) {
          if (Array.isArray(r.selected_option_ids) && r.selected_option_ids.length > 0) {
            // If question has real options → try to match by ID
            if (question.options.length > 0) {
              const matched = r.selected_option_ids.some((id: number) =>
                question.options.some((o: any) => o.id === id)
              );
              if (matched) {
                answered = true;
                r.selected_option_ids.forEach((id: number) => {
                  if (question.options.some((o: any) => o.id === id)) {
                    optionCounts.set(id, (optionCounts.get(id) || 0) + 1);
                  }
                });
              }
            } else {
              // OLD POLLS: no options stored → anyone who voted counts
              answered = true;
            }
          }
        }

        // === COMPETITOR QUESTIONS ===
        if (question.isCompetitorQuestion && Array.isArray(r.selected_competitor_ids) && r.selected_competitor_ids.length > 0) {
          answered = true;
          r.selected_competitor_ids.forEach((id: number) => {
            competitorCounts.set(id, (competitorCounts.get(id) || 0) + 1);
          });
        }

        // === OPEN-ENDED ===
        if (question.type === "open-ended" && Array.isArray(r.open_ended_responses)) {
          const match = r.open_ended_responses.find((x: any) => x?.questionId === question.id && x?.response?.trim());
          if (match) {
            answered = true;
            openEnded.push(match.response.trim());
          }
        }

        // === RATING ===
        if (question.type === "rating") {
          if (Array.isArray(r.rating)) {
            const match = r.rating.find((x: any) => x?.questionId === question.id);
            if (match?.rating != null) {
              answered = true;
              ratingValues.push(Number(match.rating));
            }
            // Fallback for old flat rating arrays
            else if (r.rating.length > 0) {
              answered = true;
              ratingValues.push(...r.rating.filter((n: any) => typeof n === "number"));
            }
          }
        }

        // Add user to answeredUsers set if they answered this specific question
        if (answered) {
          answeredUsers.add(userId);
        }
      }

      // === RANKING QUESTIONS (unchanged) ===
      if (question.type === "ranking") {
        const rankingQuery = await pool.query(`
          SELECT po.id, po.option_text AS label, pr.rank_position, COUNT(*) AS count
          FROM poll_rankings pr
          JOIN poll_options po ON pr.option_id = po.id
          WHERE pr.poll_id = $1 AND pr.question_id = $2
          GROUP BY po.id, po.option_text, pr.rank_position
          ORDER BY pr.rank_position
        `, [pollId, question.id]);

        const rankingsByPosition = new Map<number, any[]>();
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
          totalResponses: answeredUsers.size,
          rankingData: sortedRankings,
        });
        continue;
      }

      // === BUILD RESULT FOR NORMAL QUESTIONS ===
      const result: any = {
        questionId: question.id,
        questionText: question.questionText,
        type: question.type,
        isCompetitorQuestion: question.isCompetitorQuestion,
        totalResponses: answeredUsers.size,
      };

      // Choices
      if (optionCounts.size > 0 || competitorCounts.size > 0) {
        const counts = optionCounts.size > 0 ? optionCounts : competitorCounts;
        const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
        result.choices = Array.from(counts.entries()).map(([id, count]) => ({
          id,
          label: optionCounts.has(id)
            ? question.options.find((o: any) => o.id === id)?.optionText || "Unknown"
            : formattedPollData.competitors.find((c: any) => c.id === id)?.name || "Unknown",
          count,
          percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
        }));
      }

      // Rating average
      if (ratingValues.length > 0) {
        result.averageRating = Number((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(2));
      }

      // Open-ended responses
      if (openEnded.length > 0) {
        result.openEndedResponses = openEnded;
      }

      aggregatedResponses.push(result);
    }

    // === Demographics ===
    const totalRespondents = totalUniqueVoters;
    const genderCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>();
    const uniqueRespondents = new Map<string, any>();

    // First, deduplicate responses by user_identifier to count each person once
    allResponses.forEach((r: any) => {
      const userId = String(r.user_identifier);
      if (!uniqueRespondents.has(userId)) {
        uniqueRespondents.set(userId, r);
      }
    });

    // Now count demographics from unique users only
    uniqueRespondents.forEach((r: any) => {
      if (r.respondent_gender) genderCounts.set(String(r.respondent_gender), (genderCounts.get(String(r.respondent_gender)) || 0) + 1);
      if (r.respondent_age) {
        const age = parseInt(r.respondent_age, 10);
        let range = "75+";
        if (age >= 18 && age <= 24) range = "18-24";
        else if (age >= 25 && age <= 34) range = "25-34";
        else if (age >= 35 && age <= 44) range = "35-44";
        else if (age >= 45 && age <= 54) range = "45-54";
        else if (age >= 55 && age <= 64) range = "55-64";
        else if (age >= 65 && age <= 74) range = "65-74";
        ageCounts.set(range, (ageCounts.get(range) || 0) + 1);
      }
    });

    const demographics: any = {
      gender: Array.from(genderCounts.entries()).map(([label, count]) => ({
        label, count, percentage: totalRespondents > 0 ? Number(((count / totalRespondents) * 100).toFixed(1)) : 0
      })),
      ageRanges: Array.from(ageCounts.entries()).map(([label, count]) => ({
        label, count, percentage: totalRespondents > 0 ? Number(((count / totalRespondents) * 100).toFixed(1)) : 0
      })).sort((a, b) => ["18-24","25-34","35-44","45-54","55-64","65-74","75+"].indexOf(a.label) - ["18-24","25-34","35-44","45-54","55-64","65-74","75+"].indexOf(b.label)),
      totalRespondents,
    };

    res.json({
      poll: formattedPollData,
      aggregatedResponses,
      demographics,
      location: locationResult.rows,
    });

  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ message: "Server error" });
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