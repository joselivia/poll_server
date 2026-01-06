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
  type: 'multi-choice' | 'single-choice' | 'open-ended' | 'yes-no-notsure' | 'rating' | 'ranking' | 'image-upload' | 'audio-recording' | 'location';
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
  type: 'single-choice' | 'multi-choice' | 'open-ended' | 'yes-no-notsure' | 'rating' | 'ranking' | 'image-upload' | 'audio-recording' | 'location';
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
  imageUrls?: string[];
  audioUrls?: string[];
  locations?: { latitude: number; longitude: number; label?: string }[];
}

interface DemographicsData {
  gender: { label: string; count: number; percentage: number; }[];
  ageRanges: { label: string; count: number; percentage: number; }[];
  totalRespondents: number;
}

router.get("/status", async (req, res) => {
  try {
    const { pollId, voter_id } = req.query;

    // Validate inputs
    if (!pollId || !voter_id) {
      return res.status(400).json({
        success: false,
        message: "pollId and voter_id are required",
      });
    }

    // 1. Check if poll exists
    const pollCheck = await pool.query(
      "SELECT id FROM polls WHERE id = $1",
      [pollId]
    );

    if (pollCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Poll not found",
      });
    }

    // 2. Check if user has voted
    const check = await pool.query(
      "SELECT * FROM poll_responses WHERE poll_id = $1 AND user_identifier = $2",
      [pollId, voter_id]
    );
    
    const alreadyVoted = (check.rowCount ?? 0) > 0;

    return res.json({
      success: true,
      alreadyVoted,
    });
  } catch (error) {
    console.error("Error checking vote status:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


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
    const imageUploads: { questionId: number; url: string }[] = [];
    const locationResponses: { questionId: number; latitude: number; longitude: number }[] = [];
    const audioRecordings: { questionId: number; url: string }[] = [];

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

      // Image upload
      if (r.imageUrl?.trim()) {
        imageUploads.push({
          questionId: r.questionId,
          url: r.imageUrl.trim(),
        });
      }

      // Audio recording
      if (r.audioUrl?.trim()) {
        audioRecordings.push({
          questionId: r.questionId,
          url: r.audioUrl.trim(),
        });
      }

      // Location
      if (r.latitude !== undefined && r.longitude !== undefined) {
        locationResponses.push({
          questionId: r.questionId,
          latitude: r.latitude,
          longitude: r.longitude,
        });
      }
    }
    await client.query(
      `
      INSERT INTO poll_responses (
        poll_id, user_identifier,
        selected_option_ids, selected_competitor_ids,
        open_ended_responses, rating,
        image_uploads, audio_recordings,
        location_responses,
        respondent_name, respondent_age, respondent_gender,
        region, county, constituency, ward
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      [
        pollId,
        userIdentifier,
        selectedOptionIds.length > 0 ? selectedOptionIds : null,
        selectedCompetitorIds.length > 0 ? selectedCompetitorIds : null,
        openEndedResponses.length > 0 ? openEndedResponses : null,
        ratingResponses.length > 0 ? ratingResponses : null,
        imageUploads.length > 0 ? JSON.stringify(imageUploads) : null,
        audioRecordings.length > 0 ? JSON.stringify(audioRecordings) : null,
        locationResponses.length > 0 ? JSON.stringify(locationResponses) : null,
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
    // Fetch locations from both poll_responses and poll_responses_admin
    const locationResult = await pool.query(
      `SELECT DISTINCT region, county, constituency, ward FROM poll_responses WHERE poll_id = $1
       UNION
       SELECT DISTINCT NULL as region, NULL as county, constituency, ward FROM poll_responses_admin WHERE poll_id = $2 AND (constituency IS NOT NULL OR ward IS NOT NULL)`,
      [pollId, pollId]
    );

    const responsesResult = await pool.query(
      `SELECT 
         user_identifier,
         selected_option_ids,
         selected_competitor_ids,
         open_ended_responses,
         rating,
         image_uploads,
         audio_recordings,
         location_responses,
         respondent_name,
         respondent_gender,
         respondent_age
       FROM poll_responses
       ${filterQuery}`,
      params
    );

    const allResponses = responsesResult.rows;

    // Total number of people who voted at all (used as fallback)
    const totalUniqueVoters = new Set(allResponses.map(r => String(r.user_identifier))).size;

    // === 2b. Load Admin Bulk Responses (filtered by location) ===
    let adminQuery = `SELECT 
         question_id,
         option_counts,
         competitor_counts,
         open_ended_responses,
         rating_values,
         ranking_counts
       FROM poll_responses_admin
       WHERE poll_id = $1`;

    const adminParams: any[] = [pollId];

    // Apply the same location filters as regular responses
    // Include both NULL (general) data and location-specific data
    if (constituency && ward) {
      // When both are specified, get data for: NULL-NULL, constituency-NULL, and constituency-ward
      adminQuery += ` AND (
        (constituency IS NULL AND ward IS NULL) OR
        (constituency = $2 AND ward IS NULL) OR
        (constituency = $3 AND ward = $4)
      )`;
      adminParams.push(constituency, constituency, ward);
    } else if (constituency) {
      // When only constituency specified, get: NULL-NULL, constituency-NULL, and all constituency-ward combinations
      adminQuery += ` AND (
        (constituency IS NULL AND ward IS NULL) OR
        (constituency = $2)
      )`;
      adminParams.push(constituency);
    }
    // If neither is specified, get all data (including location-specific)

    const adminResponsesResult = await pool.query(adminQuery, adminParams);

    // Aggregate all admin bulk data for each question (may have multiple rows per question for different locations)
    const adminBulkData = new Map();
    adminResponsesResult.rows.forEach((row: any) => {
      const questionId = row.question_id;

      if (!adminBulkData.has(questionId)) {
        adminBulkData.set(questionId, {
          optionCounts: {},
          competitorCounts: {},
          openEndedResponses: [],
          ratingValues: [],
          rankingCounts: {},
        });
      }

      const existing = adminBulkData.get(questionId);

      // Merge option counts
      if (row.option_counts) {
        Object.entries(row.option_counts).forEach(([id, count]) => {
          existing.optionCounts[id] = (existing.optionCounts[id] || 0) + (count as number);
        });
      }

      // Merge competitor counts
      if (row.competitor_counts) {
        Object.entries(row.competitor_counts).forEach(([id, count]) => {
          existing.competitorCounts[id] = (existing.competitorCounts[id] || 0) + (count as number);
        });
      }

      // Merge open-ended responses
      if (row.open_ended_responses && Array.isArray(row.open_ended_responses)) {
        existing.openEndedResponses.push(...row.open_ended_responses);
      }

      // Merge rating values
      if (row.rating_values && Array.isArray(row.rating_values)) {
        existing.ratingValues.push(...row.rating_values);
      }

      // Merge ranking counts
      if (row.ranking_counts) {
        Object.entries(row.ranking_counts).forEach(([optionId, ranks]: [string, any]) => {
          if (!existing.rankingCounts[optionId]) {
            existing.rankingCounts[optionId] = {};
          }
          Object.entries(ranks).forEach(([rankKey, count]: [string, any]) => {
            existing.rankingCounts[optionId][rankKey] = (existing.rankingCounts[optionId][rankKey] || 0) + (count as number);
          });
        });
      }
    });

    // === 2c. Load Admin Demographics (filtered by location) ===
    let demographicsQuery = `SELECT 
         gender_counts,
         age_range_counts
       FROM poll_demographics_admin
       WHERE poll_id = $1`;

    const demographicsParams: any[] = [pollId];
    let demoIndex = 2;

    // Apply the same location filters
    if (constituency && ward) {
      demographicsQuery += ` AND (
        (constituency IS NULL AND ward IS NULL) OR
        (constituency = $${demoIndex} AND ward IS NULL) OR
        (constituency = $${demoIndex + 1} AND ward = $${demoIndex + 2})
      )`;
      demographicsParams.push(constituency, constituency, ward);
    } else if (constituency) {
      demographicsQuery += ` AND (
        (constituency IS NULL AND ward IS NULL) OR
        (constituency = $${demoIndex})
      )`;
      demographicsParams.push(constituency);
    }

    const adminDemographicsResult = await pool.query(demographicsQuery, demographicsParams);

    const adminDemographics = {
      genderCounts: {} as { [key: string]: number },
      ageRangeCounts: {} as { [key: string]: number },
    };

    adminDemographicsResult.rows.forEach((row: any) => {
      if (row.gender_counts) {
        Object.entries(row.gender_counts).forEach(([gender, count]) => {
          adminDemographics.genderCounts[gender] = (adminDemographics.genderCounts[gender] || 0) + (count as number);
        });
      }

      if (row.age_range_counts) {
        Object.entries(row.age_range_counts).forEach(([range, count]) => {
          adminDemographics.ageRangeCounts[range] = (adminDemographics.ageRangeCounts[range] || 0) + (count as number);
        });
      }
    });

    const aggregatedResponses: any[] = [];

    // === 3. Process Each Question ===
    for (const question of formattedQuestions) {
      const optionCounts = new Map<number, number>();
      const competitorCounts = new Map<number, number>();
      const openEnded: string[] = [];
      const imageUrls: string[] = [];
      const audioUrls: string[] = [];
      const locationPoints: { latitude: number; longitude: number; label?: string }[] = [];
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

        // === IMAGE UPLOAD ===
        if (question.type === "image-upload" && Array.isArray(r.image_uploads)) {
          const match = r.image_uploads.find((x: any) => x?.questionId === question.id && x?.url?.trim());
          if (match) {
            answered = true;
            imageUrls.push(match.url.trim());
          }
        }

        // === AUDIO RECORDING ===
        if (question.type === "audio-recording" && Array.isArray(r.audio_recordings)) {
          const match = r.audio_recordings.find((x: any) => x?.questionId === question.id && x?.url?.trim());
          if (match) {
            answered = true;
            audioUrls.push(match.url.trim());
          }
        }

        // === LOCATION ===
        if (question.type === "location" && Array.isArray(r.location_responses)) {
          const match = r.location_responses.find(
            (x: any) => x?.questionId === question.id &&
              x?.latitude !== undefined &&
              x?.longitude !== undefined
          );
          if (match) {
            answered = true;
            locationPoints.push({
              latitude: match.latitude,
              longitude: match.longitude,
              label: r.respondent_name || undefined,
            });
          }
        }

        // === RATING ===
        if (question.type === "rating") {
          if (Array.isArray(r.rating)) {
            const match = r.rating.find((x: any) => x?.questionId === question.id);
            if (match?.rating != null) {
              answered = true;
              const ratingValue = Number(match.rating);
              // Treat each rating as a choice
              optionCounts.set(ratingValue, (optionCounts.get(ratingValue) || 0) + 1);
            }
            // Fallback for old flat rating arrays
            else if (r.rating.length > 0) {
              answered = true;
              r.rating.filter((n: any) => typeof n === "number").forEach((rating: number) => {
                optionCounts.set(rating, (optionCounts.get(rating) || 0) + 1);
              });
            }
          }
        }

        // Only add to answeredUsers if this user actually answered THIS specific question
        if (answered) {
          answeredUsers.add(userId);
        }
      }

      // === MERGE ADMIN BULK DATA ===
      const adminData = adminBulkData.get(question.id);
      if (adminData) {
        // Merge option counts (now also used for rating)
        if (adminData.optionCounts && Object.keys(adminData.optionCounts).length > 0) {
          Object.entries(adminData.optionCounts).forEach(([id, count]) => {
            const optionId = parseInt(id);
            optionCounts.set(optionId, (optionCounts.get(optionId) || 0) + (count as number));
          });
        }

        // Merge competitor counts
        if (adminData.competitorCounts && Object.keys(adminData.competitorCounts).length > 0) {
          Object.entries(adminData.competitorCounts).forEach(([id, count]) => {
            const competitorId = parseInt(id);
            competitorCounts.set(competitorId, (competitorCounts.get(competitorId) || 0) + (count as number));
          });
        }

        // Merge open-ended responses
        if (adminData.openEndedResponses && adminData.openEndedResponses.length > 0) {
          openEnded.push(...adminData.openEndedResponses);
        }
      }

      // === RANKING QUESTIONS ===
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

        // Merge admin ranking data
        if (adminData && adminData.rankingCounts && Object.keys(adminData.rankingCounts).length > 0) {
          Object.entries(adminData.rankingCounts).forEach(([optionIdStr, ranks]: [string, any]) => {
            const optionId = parseInt(optionIdStr);
            const optionLabel = question.options.find((o: any) => o.id === optionId)?.optionText || "Unknown";

            Object.entries(ranks).forEach(([rankKey, count]: [string, any]) => {
              const rankPosition = parseInt(rankKey.replace('rank_', ''));
              if (!rankingsByPosition.has(rankPosition)) rankingsByPosition.set(rankPosition, []);

              const existing = rankingsByPosition.get(rankPosition)!.find(r => r.id === optionId);
              if (existing) {
                existing.count += count;
              } else {
                rankingsByPosition.get(rankPosition)!.push({
                  id: optionId,
                  label: optionLabel,
                  count: count,
                });
              }
            });
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

      // Choices (including rating counts)
      if (optionCounts.size > 0 || competitorCounts.size > 0) {
        const counts = optionCounts.size > 0 ? optionCounts : competitorCounts;
        const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

        result.choices = Array.from(counts.entries()).map(([id, count]) => {
          let label;
          if (question.type === "rating") {
            // For rating questions, id is the rating value (1-5)
            const ratingLabels: { [key: number]: string } = {
              1: 'Very Poor',
              2: 'Poor',
              3: 'Fair',
              4: 'Good',
              5: 'Excellent'
            };
            label = ratingLabels[id] || `Rating ${id}`;
          } else if (optionCounts.has(id)) {
            label = question.options.find((o: any) => o.id === id)?.optionText || "Unknown";
          } else {
            label = formattedPollData.competitors.find((c: any) => c.id === id)?.name || "Unknown";
          }

          return {
            id,
            label,
            count,
            percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
          };
        }).sort((a, b) => {
          // Sort ratings by value (1-5), others by count descending
          if (question.type === "rating") {
            return a.id - b.id;
          }
          return b.count - a.count;
        });

        // Calculate average rating if it's a rating question
        if (question.type === "rating") {
          const weightedSum = Array.from(counts.entries()).reduce((sum, [rating, count]) => sum + (rating * count), 0);
          result.averageRating = total > 0 ? Number((weightedSum / total).toFixed(2)) : 0;
          result.ratingValues = total;
          // Update totalResponses to include admin bulk data for rating questions
          result.totalResponses = total;
        }
      }

      // Open-ended responses
      if (openEnded.length > 0) {
        result.openEndedResponses = openEnded;
      }

      // Image URLs
      if (imageUrls.length > 0) {
        result.imageUrls = imageUrls;
      }

      // Audio URLs
      if (audioUrls.length > 0) {
        result.audioUrls = audioUrls;
      }

      // Location data
      if (locationPoints.length > 0) {
        result.locations = locationPoints;
      }

      aggregatedResponses.push(result);
    }

    // === Demographics (merge regular responses + admin bulk data) ===
    const genderCounts = new Map<string, number>();
    const ageCounts = new Map<string, number>();

    // Count from regular responses
    allResponses.forEach((r: any) => {
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

    // Merge admin bulk demographics
    Object.entries(adminDemographics.genderCounts).forEach(([gender, count]) => {
      genderCounts.set(gender, (genderCounts.get(gender) || 0) + count);
    });

    Object.entries(adminDemographics.ageRangeCounts).forEach(([range, count]) => {
      ageCounts.set(range, (ageCounts.get(range) || 0) + count);
    });

    // Calculate total respondents from both sources
    const totalFromRegular = totalUniqueVoters;
    const totalFromAdmin = Object.values(adminDemographics.genderCounts).reduce((sum, count) => sum + count, 0) ||
      Object.values(adminDemographics.ageRangeCounts).reduce((sum, count) => sum + count, 0);
    const totalRespondents = totalFromRegular + totalFromAdmin;

    const demographics: any = {
      gender: Array.from(genderCounts.entries()).map(([label, count]) => ({
        label, count, percentage: totalRespondents > 0 ? Number(((count / totalRespondents) * 100).toFixed(1)) : 0
      })),
      ageRanges: Array.from(ageCounts.entries()).map(([label, count]) => ({
        label, count, percentage: totalRespondents > 0 ? Number(((count / totalRespondents) * 100).toFixed(1)) : 0
      })).sort((a, b) => ["18-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"].indexOf(a.label) - ["18-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"].indexOf(b.label)),
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

// === ADMIN BULK RESPONSES ===

// Submit or update admin bulk response for a specific question
router.post("/:pollId/admin-bulk-response", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  const {
    questionId,
    optionCounts,
    competitorCounts,
    openEndedResponses,
    ratingValues,
    rankingCounts,
    constituency,
    ward,
  } = req.body;

  if (isNaN(pollId) || !questionId) {
    return res.status(400).json({ message: "Invalid poll ID or question ID." });
  }

  try {
    // Check if entry exists for this poll, question, constituency, and ward
    const existing = await pool.query(
      `SELECT id FROM poll_responses_admin 
       WHERE poll_id = $1 AND question_id = $2 
       AND (constituency IS NOT DISTINCT FROM $3) 
       AND (ward IS NOT DISTINCT FROM $4)`,
      [pollId, questionId, constituency || null, ward || null]
    );

    if (existing.rows.length > 0) {
      // Update existing entry
      await pool.query(
        `UPDATE poll_responses_admin
         SET option_counts = $1,
             competitor_counts = $2,
             open_ended_responses = $3,
             rating_values = $4,
             ranking_counts = $5,
             updated_at = NOW()
         WHERE poll_id = $6 AND question_id = $7
         AND (constituency IS NOT DISTINCT FROM $8)
         AND (ward IS NOT DISTINCT FROM $9)`,
        [
          JSON.stringify(optionCounts || {}),
          JSON.stringify(competitorCounts || {}),
          openEndedResponses || [],
          ratingValues || [],
          JSON.stringify(rankingCounts || {}),
          pollId,
          questionId,
          constituency || null,
          ward || null,
        ]
      );

      return res.json({ message: "Admin bulk response updated successfully." });
    } else {
      // Insert new entry
      await pool.query(
        `INSERT INTO poll_responses_admin (
           poll_id, question_id,
           option_counts, competitor_counts,
           open_ended_responses, rating_values, ranking_counts,
           constituency, ward
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          pollId,
          questionId,
          JSON.stringify(optionCounts || {}),
          JSON.stringify(competitorCounts || {}),
          openEndedResponses || [],
          ratingValues || [],
          JSON.stringify(rankingCounts || {}),
          constituency || null,
          ward || null,
        ]
      );

      return res.json({ message: "Admin bulk response created successfully." });
    }
  } catch (error: any) {
    console.error("Error submitting admin bulk response:", error);
    return res.status(500).json({ message: error.message || "Failed to submit admin bulk response." });
  }
});

// Get admin bulk responses for a poll
router.get("/:pollId/admin-bulk-responses", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  let { constituency, ward } = req.query;

  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  // Handle array query params
  if (Array.isArray(constituency)) constituency = constituency[0];
  if (Array.isArray(ward)) ward = ward[0];

  try {
    let query = `SELECT 
         question_id,
         option_counts,
         competitor_counts,
         open_ended_responses,
         rating_values,
         ranking_counts,
         constituency,
         ward,
         updated_at
       FROM poll_responses_admin
       WHERE poll_id = $1`;

    const params: any[] = [pollId];
    let paramIndex = 2;

    // Exact match for the selected location (including NULL matching)
    if (constituency) {
      query += ` AND constituency = $${paramIndex++}`;
      params.push(constituency);

      if (ward) {
        query += ` AND ward = $${paramIndex++}`;
        params.push(ward);
      } else {
        query += ` AND ward IS NULL`;
      }
    } else {
      // No constituency selected - fetch general data only (NULL-NULL)
      query += ` AND constituency IS NULL AND ward IS NULL`;
    }

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (error: any) {
    console.error("Error fetching admin bulk responses:", error);
    return res.status(500).json({ message: "Failed to fetch admin bulk responses." });
  }
});

// === ADMIN DEMOGRAPHICS ENDPOINTS ===

// Save or update admin demographics for a poll location
router.post("/:pollId/admin-demographics", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  const { genderCounts, ageRangeCounts, constituency, ward } = req.body;

  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  try {
    // Check if entry exists for this poll and location
    const existing = await pool.query(
      `SELECT id FROM poll_demographics_admin 
       WHERE poll_id = $1 
       AND (constituency IS NOT DISTINCT FROM $2) 
       AND (ward IS NOT DISTINCT FROM $3)`,
      [pollId, constituency || null, ward || null]
    );

    if (existing.rows.length > 0) {
      // Update existing entry
      await pool.query(
        `UPDATE poll_demographics_admin
         SET gender_counts = $1,
             age_range_counts = $2,
             updated_at = NOW()
         WHERE poll_id = $3
         AND (constituency IS NOT DISTINCT FROM $4)
         AND (ward IS NOT DISTINCT FROM $5)`,
        [
          JSON.stringify(genderCounts || {}),
          JSON.stringify(ageRangeCounts || {}),
          pollId,
          constituency || null,
          ward || null,
        ]
      );

      return res.json({ message: "Demographics updated successfully." });
    } else {
      // Insert new entry
      await pool.query(
        `INSERT INTO poll_demographics_admin (
           poll_id, gender_counts, age_range_counts, constituency, ward
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          pollId,
          JSON.stringify(genderCounts || {}),
          JSON.stringify(ageRangeCounts || {}),
          constituency || null,
          ward || null,
        ]
      );

      return res.json({ message: "Demographics created successfully." });
    }
  } catch (error: any) {
    console.error("Error saving demographics:", error);
    return res.status(500).json({ message: error.message || "Failed to save demographics." });
  }
});

// Get admin demographics for a poll location
router.get("/:pollId/admin-demographics", async (req, res) => {
  const pollId = parseInt(req.params.pollId, 10);
  let { constituency, ward } = req.query;

  if (isNaN(pollId)) {
    return res.status(400).json({ message: "Invalid poll ID." });
  }

  // Handle array query params
  if (Array.isArray(constituency)) constituency = constituency[0];
  if (Array.isArray(ward)) ward = ward[0];

  try {
    let query = `SELECT 
         gender_counts,
         age_range_counts,
         constituency,
         ward,
         updated_at
       FROM poll_demographics_admin
       WHERE poll_id = $1`;

    const params: any[] = [pollId];
    let paramIndex = 2;

    // Exact match for the selected location
    if (constituency) {
      if (ward) {
        query += ` AND constituency = $${paramIndex} AND ward = $${paramIndex + 1}`;
        params.push(constituency, ward);
      } else {
        query += ` AND constituency = $${paramIndex} AND ward IS NULL`;
        params.push(constituency);
      }
    } else {
      query += ` AND constituency IS NULL AND ward IS NULL`;
    }

    const result = await pool.query(query, params);

    return res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (error: any) {
    console.error("Error fetching demographics:", error);
    return res.status(500).json({ message: "Failed to fetch demographics." });
  }
});

export default router;