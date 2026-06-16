import 'dotenv/config';
import axios from 'axios';
import jwt from 'jsonwebtoken';

const API = 'http://localhost:4000/api';
const SECRET = process.env.JWT_SECRET!;

async function test() {
  console.log('--- RESTRICTED ACCESS TEST ---');
  
  // 1. Create a Mock Student Token
  const studentToken = jwt.sign({ id: 'mock-student-id', role: 'student', email: 'student@test.com' }, SECRET);
  
  try {
    console.log('Testing access to ADMIN routes with STUDENT token...');
    const res = await axios.get(`${API}/admin/quizzes`, { 
      headers: { Authorization: `Bearer ${studentToken}` } 
    });
    console.error('FAIL: Student was able to access admin quizzes!');
  } catch (err: any) {
    if (err.response?.status === 403) {
      console.log('PASS: Student was blocked with 403 Forbidden.');
    } else {
      console.error('ERROR: Unexpected error response:', err.response?.status);
    }
  }

  // 2. Test access to Student routes with Admin token (should be allowed or handled)
  const adminToken = jwt.sign({ id: 'mock-admin-id', role: 'admin', email: 'admin@test.com' }, SECRET);
  try {
    console.log('\nTesting access to STUDENT dashboard with ADMIN token...');
    // This is checking if the backend technically allows the request (authentication)
    // The frontend handles the UI separation
    const res = await axios.get(`${API}/quizzes`, { 
      headers: { Authorization: `Bearer ${adminToken}` } 
    });
    console.log('PASS: Admin can technically reach the public API (Standard behavior).');
  } catch (err: any) {
     console.log('INFO: Admin access to public API resulted in:', err.response?.status || 'Unknown');
  }
}

test();
