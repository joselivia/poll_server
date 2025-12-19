import { betterAuth } from "better-auth";
import { pool } from "../config-db";
import type { PoolClient } from "pg";

// PostgreSQL adapter for better-auth
const postgresAdapter = {
  create: async (table: string, data: any) => {
    const client = await pool.connect();
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const columns = keys.join(", ");
      
      const query = `
        INSERT INTO ${table} (${columns})
        VALUES (${placeholders})
        RETURNING *
      `;
      
      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  },

  findOne: async (table: string, where: any) => {
    const client = await pool.connect();
    try {
      const keys = Object.keys(where);
      const values = Object.values(where);
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");
      
      const query = `SELECT * FROM ${table} WHERE ${conditions} LIMIT 1`;
      const result = await client.query(query, values);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  },

  findMany: async (table: string, where?: any) => {
    const client = await pool.connect();
    try {
      let query = `SELECT * FROM ${table}`;
      let values: any[] = [];
      
      if (where && Object.keys(where).length > 0) {
        const keys = Object.keys(where);
        values = Object.values(where);
        const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");
        query += ` WHERE ${conditions}`;
      }
      
      const result = await client.query(query, values);
      return result.rows;
    } finally {
      client.release();
    }
  },

  update: async (table: string, where: any, data: any) => {
    const client = await pool.connect();
    try {
      const setKeys = Object.keys(data);
      const setValues = Object.values(data);
      const whereKeys = Object.keys(where);
      const whereValues = Object.values(where);
      
      const setClause = setKeys.map((key, i) => `${key} = $${i + 1}`).join(", ");
      const whereClause = whereKeys.map((key, i) => `${key} = $${setKeys.length + i + 1}`).join(" AND ");
      
      const query = `
        UPDATE ${table}
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE ${whereClause}
        RETURNING *
      `;
      
      const result = await client.query(query, [...setValues, ...whereValues]);
      return result.rows[0];
    } finally {
      client.release();
    }
  },

  delete: async (table: string, where: any) => {
    const client = await pool.connect();
    try {
      const keys = Object.keys(where);
      const values = Object.values(where);
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");
      
      const query = `DELETE FROM ${table} WHERE ${conditions} RETURNING *`;
      const result = await client.query(query, values);
      return result.rows[0];
    } finally {
      client.release();
    }
  },
};

export const auth = betterAuth({
  database: postgresAdapter as any,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true if you want email verification
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "client",
      },
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    'https://politrack.africa',
    process.env.CLIENT_URL || "",
  ],
});

export type Session = typeof auth.$Infer.Session;

