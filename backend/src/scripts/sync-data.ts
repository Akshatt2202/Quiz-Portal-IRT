import 'dotenv/config';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import prisma from '../config/db';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Export URLs for specific sheets (assuming GIDs based on common patterns)
const CONCEPTS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const QUESTIONS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1119760773`; 

interface ConceptRecord {
  concept_id?: string;
  id?: string;
  concept_name?: string;
  name?: string;
  description?: string;
  chapter?: string;
  ncert_section?: string;
  bloom_level?: string;
  difficulty_level?: string;
  concept_type?: string;
  misconception?: string;
  prerequisites?: string;
  prerequisite_ids?: string;
}

interface QuestionRecord {
  question_id?: string;
  id?: string;
  concept_ids?: string;
  concept_id?: string;
  stem?: string;
  text?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer?: string;
  wrong_a_confusion?: string;
  wrong_b_confusion?: string;
  wrong_c_confusion?: string;
  wrong_d_confusion?: string;
}

async function downloadCSV(url: string) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    console.error(`Failed to download from ${url}: ${error.message}`);
    return null;
  }
}

async function syncConcepts() {
  console.log('--- Syncing Concepts ---');
  const csvData = await downloadCSV(CONCEPTS_URL);
  if (!csvData) return;

  const records = parse(csvData, { columns: true, skip_empty_lines: true }) as ConceptRecord[];
  
  for (const row of records) {
    const conceptId = row.concept_id || row.id;
    if (!conceptId) continue;

    await prisma.concept.upsert({
      where: { concept_id: conceptId },
      update: {
        concept_name: (row.concept_name || row.name) || 'Unknown Concept',
        description: row.description,
        chapter: row.chapter,
        ncert_section: row.ncert_section,
        bloom_level: row.bloom_level,
        difficulty_level: row.difficulty_level ? parseInt(row.difficulty_level) : 1,
        concept_type: row.concept_type,
        misconception: row.misconception,
      },
      create: {
        concept_id: conceptId,
        concept_name: (row.concept_name || row.name) || 'Unknown Concept',
        description: row.description,
        chapter: row.chapter,
        ncert_section: row.ncert_section,
        bloom_level: row.bloom_level,
        difficulty_level: row.difficulty_level ? parseInt(row.difficulty_level) : 1,
        concept_type: row.concept_type,
        misconception: row.misconception,
      }
    });
  }
  console.log(`Synced ${records.length} concepts.`);

  // Handle prerequisites (Self-referential Many-to-Many)
  for (const row of records) {
    const conceptId = row.concept_id || row.id;
    const prereqs = row.prerequisites || row.prerequisite_ids;
    if (conceptId && prereqs) {
      const ids = prereqs.split(',').map((s: string) => s.trim()).filter(Boolean);
      await prisma.concept.update({
        where: { concept_id: conceptId },
        data: {
          prerequisites: {
            connect: ids.map((id: string) => ({ concept_id: id }))
          }
        }
      });
    }
  }
}

async function syncQuestions() {
  console.log('--- Syncing Questions ---');
  const csvData = await downloadCSV(QUESTIONS_URL);
  if (!csvData) {
    console.warn('Skipping questions sync (Questions sheet not accessible or GID incorrect)');
    return;
  }

  const records = parse(csvData, { columns: true, skip_empty_lines: true }) as QuestionRecord[];

  const quiz = await prisma.quiz.upsert({
    where: { id: 'global-knowledge-bank' },
    update: {},
    create: {
      id: 'global-knowledge-bank',
      title: 'Global Knowledge Bank',
      description: 'Auto-synced from Knowledge Graph source',
      duration_seconds: 3600,
      created_by: 'system',
      status: 'active'
    }
  });

  for (const row of records) {
    const questionId = row.question_id || row.id;
    if (!questionId) continue;

    const conceptIds = (row.concept_ids || row.concept_id || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const options = [
      { id: 'A', text: row.option_a },
      { id: 'B', text: row.option_b },
      { id: 'C', text: row.option_c },
      { id: 'D', text: row.option_d },
    ].filter(o => o.text);

    await prisma.question.upsert({
      where: { question_id: questionId },
      update: {
        stem: (row.stem || row.text) || 'Empty Question',
        options: options as any,
        correct_answer: row.correct_answer || 'A',
        wrong_a_confusion: row.wrong_a_confusion,
        wrong_b_confusion: row.wrong_b_confusion,
        wrong_c_confusion: row.wrong_c_confusion,
        wrong_d_confusion: row.wrong_d_confusion,
        concepts: {
          set: conceptIds.map(id => ({ concept_id: id }))
        }
      },
      create: {
        question_id: questionId,
        quiz_id: quiz.id,
        stem: (row.stem || row.text) || 'Empty Question',
        options: options as any,
        correct_answer: row.correct_answer || 'A',
        order_index: 0,
        wrong_a_confusion: row.wrong_a_confusion,
        wrong_b_confusion: row.wrong_b_confusion,
        wrong_c_confusion: row.wrong_c_confusion,
        wrong_d_confusion: row.wrong_d_confusion,
        concepts: {
          connect: conceptIds.map(id => ({ concept_id: id }))
        }
      }
    });
  }
}

async function run() {
  try {
    await syncConcepts();
    await syncQuestions();
    console.log('Sync complete!');
  } catch (error) {
    console.error('Sync failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
