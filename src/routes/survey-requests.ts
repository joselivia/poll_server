import { Router, Request, Response } from "express";
import pool from "../config-db";

const router = Router();

// POST - Submit a new survey request
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      contact,
      duration,
      dataCollectionType,
      additionalNotes,
      sampleSize,
      locationLevel,
      selectedLocations,
      otherLocationRequest,
    } = req.body;

    // Validation
    if (
      !name ||
      !email ||
      !contact ||
      !duration ||
      !dataCollectionType ||
      !sampleSize ||
      !locationLevel ||
      (!selectedLocations?.length && !otherLocationRequest)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

   

    // Insert survey request into database
    const query = `
      INSERT INTO survey_requests (
        name,
        email,
        contact,
        duration,
        data_collection_type,
        additional_notes,
        sample_size,
        location_level,
        selected_locations,
        other_location_request,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      name,
      email,
      contact,
      duration,
      dataCollectionType,
      additionalNotes || null,
      sampleSize,
      locationLevel,
      selectedLocations || [],
      otherLocationRequest || null,
      "pending",
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: "Survey request submitted successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error submitting survey request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit survey request",
      error: error.message,
    });
  }
});

// GET - Fetch all survey requests (for admin)
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT *
      FROM survey_requests
    `;

    const values: any[] = [];

    // Filter by status if provided
    if (status) {
      query += ` WHERE status = $1`;
      values.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM survey_requests`;
    if (status) {
      countQuery += ` WHERE status = $1`;
    }
    const countResult = await pool.query(
      countQuery,
      status ? [status] : []
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error("Error fetching survey requests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch survey requests",
      error: error.message,
    });
  }
});

// GET - Fetch a single survey request by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT *
      FROM survey_requests
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Survey request not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error fetching survey request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch survey request",
      error: error.message,
    });
  }
});

// PATCH - Update survey request status (for admin)
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["pending", "in_progress", "completed", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const query = `
      UPDATE survey_requests
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Survey request not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Survey request status updated successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error updating survey request status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update survey request status",
      error: error.message,
    });
  }
});

// DELETE - Delete a survey request (for admin)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const query = `
      DELETE FROM survey_requests
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Survey request not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Survey request deleted successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error deleting survey request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete survey request",
      error: error.message,
    });
  }
});

export default router;
