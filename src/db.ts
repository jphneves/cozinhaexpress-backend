import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não definida no .env');
}
const sql = postgres(connectionString, {
  // Opcional: configurações recomendadas para pooler do Supabase
  prepare: false // Importante: pooler do Supabase NÃO suporta PREPARE statements
});

export default sql;
