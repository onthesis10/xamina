const axios = require('axios');
async function run() {
  try {
    const login = await axios.post('http://localhost:8080/api/v1/auth/login', {
      email: 'superadmin@xamina.local',
      password: 'Admin123!'
    });
    const token = login.data.data.access_token;
    console.log('Login success');
    const summary = await axios.get('http://localhost:8080/api/v1/dashboard/summary', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Summary success:', summary.data);
  } catch (e) {
    if (e.response) {
      console.log('Error:', e.response.status, JSON.stringify(e.response.data, null, 2));
    } else {
      console.log('Error:', e.message);
    }
  }
}
run();
