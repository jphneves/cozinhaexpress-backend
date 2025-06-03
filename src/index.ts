import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql from './db';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { translate } from '@vitalets/google-translate-api';
import NodeCache from 'node-cache';

dotenv.config();

const prisma = new PrismaClient();
const app = express();

// Configuração do CORS
const corsOptions = {
  origin: [
    'https://cozinha-express.vercel.app',
    'https://cozinha-express-git-main-jphneves-projects.vercel.app/',
    'https://cozinhaexpress-backend-production.up.railway.app/login',
    'http://localhost:3000' 
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};

app.use(cors(corsOptions)); // Adicione esta linha

app.use(express.json());

const cache = new NodeCache({ stdTTL: 86400 }); // Cache por 24 horas

// Listar todos os usuários
app.get('/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany();
    res.json(usuarios);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar usuário por ID
app.get('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
    });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json(usuario);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar usuário
app.post('/usuarios', async (req, res) => {
  const { email, senha } = req.body;
  try {
    console.log('Tentando cadastrar:', email);
    // Verifica se já existe
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email },
    });
    if (usuarioExistente) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Salva no banco
    const novoUsuario = await prisma.usuario.create({
      data: {
        email,
        senha: senhaHash,
      },
    });

    res.status(201).json({ usuario: novoUsuario });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar usuário
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { email, senha } = req.body;
  try {
    // É uma boa prática fazer hash da senha também na atualização, se ela for fornecida
    const dataToUpdate: { email?: string; senha?: string } = {};
    if (email) {
      dataToUpdate.email = email;
    }
    if (senha) {
      dataToUpdate.senha = await bcrypt.hash(senha, 10);
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ error: 'Nenhum dado fornecido para atualização' });
    }

    const result = await prisma.usuario.update({
      where: { id },
      data: dataToUpdate,
    });
    if (!result) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ usuario: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar usuário
app.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await prisma.usuario.delete({
      where: { id },
    });
    if (!result) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  console.log('Tentativa de login recebida:', { email, senha_recebida: senha ? 'SIM' : 'NÃO' });
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    if (!usuario) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    const senhaConfere = await bcrypt.compare(senha, usuario.senha);
    if (!senhaConfere) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    res.status(200).json({ usuario });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para buscar e traduzir receita da MealDB
app.get('/api/recipe/:name', async (req, res) => {
  const { name } = req.params;
  try {
    // Verificar cache primeiro
    const cacheKey = `recipe_${name}_pt`;
    const cachedRecipe = cache.get(cacheKey);
    if (cachedRecipe) {
      return res.json(cachedRecipe);
    }

    // Buscar da API The MealDB
    const response = await axios.get(
      `https://www.themealdb.com/api/json/v1/1/search.php?s=${name}`
    );
    const meal = response.data.meals ? response.data.meals[0] : null;
    if (!meal) {
      return res.status(404).json({ error: 'Receita não encontrada' });
    }

    // Traduzir campos principais
    const translatedMeal = { ...meal };
    translatedMeal.strMeal = (await translate(meal.strMeal, { to: 'pt' })).text;
    translatedMeal.strInstructions = (await translate(meal.strInstructions, { to: 'pt' })).text;
    
    // Traduzir ingredientes (strIngredient1 a strIngredient20)
    for (let i = 1; i <= 20; i++) {
      const ingredient = meal[`strIngredient${i}`];
      if (ingredient) {
        translatedMeal[`strIngredient${i}`] = (await translate(ingredient, { to: 'pt' })).text;
      }
    }

    // Armazenar no cache
    cache.set(cacheKey, translatedMeal);

    res.json(translatedMeal);
  } catch (error: unknown) {
    console.error('Erro:', (error as Error).message);
    res.status(500).json({ error: 'Falha ao buscar ou traduzir a receita' });
  }
});

// Endpoint genérico para tradução de texto
app.get('/api/translate', async (req, res) => {
  const { text } = req.query;
  if (!text) {
    return res.status(400).json({ error: 'Parâmetro de texto é obrigatório' });
  }
  try {
    const cacheKey = `translate_${text}_pt`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ translated: cached });
    }
    const translated = await translate(text as string, { to: 'pt' });
    cache.set(cacheKey, translated.text);
    res.json({ translated: translated.text });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Falha na tradução' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

export async function getInstruments() {
  const instruments = await sql`SELECT * FROM instruments`;
  return instruments;
}