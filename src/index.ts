import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql from './db';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

dotenv.config();

// Garantir uma única instância do Prisma Client
// Declaração para evitar erro de tipo no TypeScript
declare global {
  var prisma: PrismaClient | undefined;
}

// Configurar Prisma para usar a URL direta do Supabase com pooler de transações
const prisma = global.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

console.log('Prisma Client inicializado com URL direta do Supabase');

const app = express();

// Configuração do CORS
const corsOptions = {
  origin: '*', // Permite qualquer origem para desenvolvimento
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions)); // Adicione esta linha

app.use(express.json());

// Listar todos os usuários
app.get('/usuarios', async (req, res) => {
  try {
    console.log('Tentando listar usuários do Supabase com Prisma');
    const usuarios = await prisma.usuario.findMany();
    console.log('Usuários encontrados:', usuarios);
    res.json(usuarios);
  } catch (err: any) {
    console.error('Erro geral ao listar usuários:', err);
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
    console.error('Erro no login:', err);
    res.status(500).json({ error: err.message });
  }
});

// Alterar senha
app.post('/api/user/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    if (!usuario) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    const senhaConfere = await bcrypt.compare(currentPassword, usuario.senha);
    if (!senhaConfere) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const novaSenhaHash = await bcrypt.hash(newPassword, 10);
    const result = await prisma.usuario.update({
      where: { email },
      data: { senha: novaSenhaHash },
    });

    res.status(200).json({ message: 'Senha alterada com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir conta
app.delete('/api/user/delete-account', async (req, res) => {
  const { email, password } = req.body;
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    if (!usuario) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    const senhaConfere = await bcrypt.compare(password, usuario.senha);
    if (!senhaConfere) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    await prisma.usuario.delete({
      where: { email },
    });

    res.status(200).json({ message: 'Conta excluída com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de teste para verificar conexão com Supabase
app.get('/test-supabase', async (req, res) => {
  try {
    console.log('Testando conexão com Supabase');
    // Tentar uma query simples para verificar conexão
    const usuarios = await prisma.usuario.findMany({
      take: 1,
    });
    console.log('Conexão com Supabase bem-sucedida:', usuarios);
    res.status(200).json({ message: 'Conexão com Supabase bem-sucedida', data: usuarios });
  } catch (err: any) {
    console.error('Erro geral ao testar Supabase:', err);
    res.status(500).json({ error: 'Erro geral ao testar Supabase', details: err.message });
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