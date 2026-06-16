import 'dotenv/config';
import xlsx from 'xlsx';
import prisma from '../config/db';
import path from 'path';

async function importConcepts() {
  const filePath = path.resolve(__dirname, '../../../Synapse_KG_Concepts.xlsx');
  console.log(`Reading concepts from: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets['02_KG_Concepts'];
  if (!sheet) {
    console.error('Could not find 02_KG_Concepts sheet.');
    return;
  }
  
  const records = xlsx.utils.sheet_to_json<any>(sheet, { range: 1 });
  console.log(`Found ${records.length} concepts.`);

  for (const row of records) {
    const conceptId = row['Concept ID'];
    if (!conceptId) continue;

    const diffParts = (row['Difficulty Level']?.toString() || '1').split('/');
    const difficultyLevel = parseInt(diffParts[0], 10) || 1;

    await prisma.concept.upsert({
      where: { concept_id: conceptId },
      update: {
        concept_name: row['Concept Name'] || 'Unknown',
        description: row['Description / Definition'],
        chapter: row['NCERT Mapping: Chapter'],
        ncert_section: row['NCERT Section (10th)'],
        bloom_level: row['Bloom Taxonomy Level'],
        difficulty_level: difficultyLevel,
        concept_type: row['Concept Type'],
        misconception: row['Common Misconception (Optional)'],
      },
      create: {
        concept_id: conceptId,
        concept_name: row['Concept Name'] || 'Unknown',
        description: row['Description / Definition'],
        chapter: row['NCERT Mapping: Chapter'],
        ncert_section: row['NCERT Section (10th)'],
        bloom_level: row['Bloom Taxonomy Level'],
        difficulty_level: difficultyLevel,
        concept_type: row['Concept Type'],
        misconception: row['Common Misconception (Optional)'],
      }
    });

    // Handle prerequisites comma-separated string
    const prereqsStr = row['Prerequisite Concept IDs'];
    if (prereqsStr && prereqsStr.trim() !== '' && prereqsStr !== '—') {
      const ids = prereqsStr.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
      try {
        await prisma.concept.update({
          where: { concept_id: conceptId },
          data: {
            prerequisites: {
              connect: ids.map((id: string) => ({ concept_id: id }))
            }
          }
        });
      } catch (err: any) {
        // Some prerequisite concepts may not exist yet if they appear later in the loop (or missing),
        // A complete 2-pass approach is better for prerequisites. But we swallow error here to not break full sync.
      }
    }
  }
}

async function importPrerequisitesAgain() {
  const filePath = path.resolve(__dirname, '../../../Synapse_KG_Concepts.xlsx');
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets['02_KG_Concepts'];
  if (!sheet) return;
  const records = xlsx.utils.sheet_to_json<any>(sheet, { range: 1 });
  
  for (const row of records) {
    const conceptId = row['Concept ID'];
    const prereqsStr = row['Prerequisite Concept IDs'];
    if (conceptId && prereqsStr && prereqsStr.trim() !== '' && prereqsStr !== '—') {
      const ids = prereqsStr.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
      try {
        await prisma.concept.update({
          where: { concept_id: conceptId },
          data: {
            prerequisites: {
              connect: ids.map((id: string) => ({ concept_id: id }))
            }
          }
        });
      } catch (e) {}
    }
  }
}

async function importQuestions() {
  const filePath = path.resolve(__dirname, '../../../Synapse_Quiz_30Q.xlsx');
  console.log(`Reading questions from: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]]; // usually the first sheet
  
  const records = xlsx.utils.sheet_to_json<any>(sheet, { range: 1 });
  console.log(`Found ${records.length} questions.`);

  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!adminUser) throw new Error('No admin user found to assign as creator');

  const quiz = await prisma.quiz.upsert({
    where: { id: 'synapse-diagnostic-quiz' },
    update: {},
    create: {
      id: 'synapse-diagnostic-quiz',
      title: 'Synapse Diagnostic Quiz',
      description: 'Imported from local Excel file',
      duration_seconds: 3600,
      created_by: adminUser.id,
      status: 'active'
    }
  });

  let index = 0;
  for (const row of records) {
    if (!row['Q#']) continue;
    const questionId = `Q-${row['Q#']}`;

    const rawConcepts = row['concept_id'];
    let conceptIds: string[] = [];
    if (typeof rawConcepts === 'string') {
        conceptIds = rawConcepts.split(',').map(s => s.trim()).filter(s => s !== '');
    } else if (rawConcepts !== undefined && rawConcepts !== null) {
        conceptIds = [rawConcepts.toString().trim()];
    }

    const options = [
      { id: 'A', text: row['Option A'] },
      { id: 'B', text: row['Option B'] },
      { id: 'C', text: row['Option C'] },
      { id: 'D', text: row['Option D'] },
    ].filter(o => o.text);

    const existingConcepts = await prisma.concept.findMany({
      where: { concept_id: { in: conceptIds } },
      select: { concept_id: true }
    });
    const validConceptIds = existingConcepts.map(c => c.concept_id);

    await prisma.question.upsert({
      where: { question_id: questionId },
      update: {
        stem: row['Question Stem'] || 'Empty Question',
        options: options as any,
        correct_answer: row['Correct Answer'] || 'A',
        wrong_a_confusion: row['Wrong A — Confusion / Weak Topic'] || '',
        wrong_b_confusion: row['Wrong B — Confusion / Weak Topic'] || '',
        wrong_c_confusion: row['Wrong C — Confusion / Weak Topic'] || '',
        wrong_d_confusion: row['Wrong D — Confusion / Weak Topic'] || '',
        concepts: {
          set: validConceptIds.map(id => ({ concept_id: id }))
        }
      },
      create: {
        question_id: questionId,
        quiz_id: quiz.id,
        stem: row['Question Stem'] || 'Empty Question',
        options: options as any,
        correct_answer: row['Correct Answer'] || 'A',
        order_index: index++,
        wrong_a_confusion: row['Wrong A — Confusion / Weak Topic'] || '',
        wrong_b_confusion: row['Wrong B — Confusion / Weak Topic'] || '',
        wrong_c_confusion: row['Wrong C — Confusion / Weak Topic'] || '',
        wrong_d_confusion: row['Wrong D — Confusion / Weak Topic'] || '',
        concepts: {
          connect: validConceptIds.map(id => ({ concept_id: id }))
        }
      }
    });
  }
}

async function run() {
  try {
    await importConcepts();
    await importPrerequisitesAgain(); // 2-pass
    await importQuestions();
    console.log('Import successful!');
  } catch (err) {
    console.error('Import failed', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
