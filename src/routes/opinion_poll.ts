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
  type: 'multi-choice'| 'single-choice' | 'open-ended' | 'yes-no-notsure' | 'rating';
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
  type: 'single-choice'| 'multi-choice' | 'open-ended' | 'yes-no-notsure' | 'rating';
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
}

interface DemographicsData {
  gender: { label: string; count: number; percentage: number; }[];
  ageRanges: { label: string; count: number; percentage: number; }[];
  totalRespondents: number;
}
router.post("/:pollId/vote", async (req, res) => {
  const pollId = parseInt(req.params.pollId);
  const { userIdentifier, responses, respondentName, respondentAge, respondentGender,region,
    county,
    constituency,
    ward} = req.body;
  if (isNaN(pollId) || !userIdentifier || !Array.isArray(responses) || responses.length === 0 || !respondentGender) {
    return res.status(400).json({ message: "Missing respondent details or responses." });
  }
  const selectedOptionIds: number[] = [];
  const selectedCompetitorIds: number[] = [];
let openEndedResponses: { questionId: number; response: string }[] = [];
let ratingResponses: { questionId: number; rating: number }[] = [];

  for (const r of responses) {
    // Multi-choice or single-choice
    if (r.selectedOptionIds) {
      if (Array.isArray(r.selectedOptionIds)) {
        selectedOptionIds.push(...r.selectedOptionIds);
      } else {
        selectedOptionIds.push(r.selectedOptionIds);
      }
    }

    // Competitor selections
    if (r.selectedCompetitorId) {
      if (Array.isArray(r.selectedCompetitorId)) {
        selectedCompetitorIds.push(...r.selectedCompetitorId);
      } else {
        selectedCompetitorIds.push(r.selectedCompetitorId);
      }
    }

    // Open-ended (store the LAST one)
    if (r.openEndedResponse) {
openEndedResponses.push({
  questionId: r.questionId,
  response: r.openEndedResponse
});

    }

if (r.rating ) {
  ratingResponses.push({
    questionId: r.questionId,
    rating: r.rating
  });
}
 
  }
  try {
const openEndedResponsesJson = openEndedResponses;
await pool.query(`
  INSERT INTO poll_responses (
    poll_id, user_identifier,
    selected_option_ids, selected_competitor_ids,
    open_ended_responses,rating,
    respondent_name, respondent_age, respondent_gender,
    region, county, constituency, ward
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
`, [
  pollId,
  userIdentifier,
  selectedOptionIds.length > 0 ? selectedOptionIds : null,
  selectedCompetitorIds.length > 0 ? selectedCompetitorIds : null,
  openEndedResponsesJson ,
  JSON.stringify(ratingResponses),
  respondentName,
  respondentAge,
  respondentGender,
  region,
  county,
  constituency,
  ward
]
);

    res.status(201).json({ message: "Votes submitted successfully." });
  } catch (error: any) {
     console.error("Vote submission transaction error:", error);
    res.status(500).json({ message: error.message || "Failed to submit votes." });
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

  // Initialize counters
  const optionCounts = new Map<number, number>();
  const competitorCounts = new Map<number, number>();
  const openEnded: string[] = [];
let ratingValues: number[] = [];

  let respondentSet = new Set<string>();

  for (const r of allResponses) {
    const user = String(r.user_identifier);

    // 🌟 Count respondent if they answered anything in this question
    let answered = false;

    // If competitor question
    if (isCompetitor && r.selected_competitor_ids) {
      for (const id of r.selected_competitor_ids) {
        const competitorMatch = formattedPollData.competitors.find(c => c.id === id);
        if (competitorMatch) {
          competitorCounts.set(id, (competitorCounts.get(id) || 0) + 1);
          answered = true;
        }
      }
    }
    if (!isCompetitor && r.selected_option_ids) {

      // Check only options belonging to this question
      for (const id of r.selected_option_ids) {
        const match = question.options?.find(o => o.id === id);
        if (match) {
          optionCounts.set(id, (optionCounts.get(id) || 0) + 1);
          answered = true;
        }
      }
    }

    // Open ended
  if (question.type === "open-ended" && Array.isArray(r.open_ended_responses)) {
    const match = r.open_ended_responses.find((a: any) => a.questionId === question.id);
    if (match?.response) {
      openEnded.push(match.response);
      answered = true; // ensure respondent count increments
    }
  }
// Ratings
  if (question.type === "rating" && Array.isArray(r.rating)) {
      const match = r.rating.find((v: any) => v.questionId === question.id);
      if (match?.rating !== undefined && match.rating !== null) {
        ratingValues.push(Number(match.rating));
        answered = true;
      }
    }


    if (answered) respondentSet.add(user);
  }

  const aggregated: AggregatedResponse = {
    questionId: question.id,
    questionText: question.questionText,
    type: question.type,
    isCompetitorQuestion: isCompetitor,
    totalResponses: respondentSet.size,
  };

  // Save options
  if (optionCounts.size > 0) {
    const totalSelections = Array.from(optionCounts.values()).reduce((a, b) => a + b, 0);

    aggregated.choices = Array.from(optionCounts.entries()).map(([id, count]) => {
      const label = question.options?.find(o => o.id === id)?.optionText ?? `Option ${id}`;
      return {
        id,
        label,
        count,
        percentage: totalSelections > 0 ? (count / totalSelections) * 100 : 0,
      };
    });

    aggregated.totalSelections = totalSelections;
  }

  // Save competitor responses
  if (competitorCounts.size > 0) {
    const totalSelections = Array.from(competitorCounts.values()).reduce((a, b) => a + b, 0);

    aggregated.choices = Array.from(competitorCounts.entries()).map(([id, count]) => {
      const comp = formattedPollData.competitors.find(c => c.id === id);
      return {
        id,
        label: comp ? comp.name : `Competitor ${id}`,
        count,
        percentage: totalSelections > 0 ? (count / totalSelections) * 100 : 0,
      };
    });
  }
  // Rating
  if (question.type === "rating") {
    const totalRatings = ratingValues.length;
    const average = totalRatings > 0 ? ratingValues.reduce((a, b) => a + b, 0) / totalRatings : 0;
    aggregated.averageRating = Number(average.toFixed(2));

   // aggregated.scale = question.scale || 5; // default scale if missing
  }
  // Save open ended
  if (question.type === "open-ended") {
    aggregated.openEndedResponses = openEnded;
  }


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