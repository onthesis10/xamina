import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 50 }, // Ramp up to 50 concurrent virtual users
        { duration: '1m', target: 50 },  // Hold at 50 users
        { duration: '30s', target: 0 },  // Ramp down to 0
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.01'],   // Error rate must be < 1%
    },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8080/api/v1';

export default function () {
    // Test Superadmin Dashboard Logic (Multi-Tenant Aggregate Query)
    const payload = JSON.stringify({
        email: 'superadmin@xamina.local',
        password: 'Admin123!',
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const loginRes = http.post(`${BASE_URL}/auth/login`, payload, params);

    check(loginRes, {
        'login success': (r) => r.status === 200,
        'has token': (r) => r.json('data.access_token') !== undefined,
    });

    if (loginRes.status === 200) {
        const token = loginRes.json('data.access_token');

        const authHeaders = {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-Tenant-Id': '1eddfab0-a50d-4c56-9b4b-d2155fbe358c' // Simulated Switch
            },
        };

        const dashboardRes = http.get(`${BASE_URL}/dashboard/summary`, authHeaders);

        check(dashboardRes, {
            'dashboard aggregate is fast': (r) => r.status === 200,
        });

        sleep(1);
    }
}
