// API layer — semua call via axios instance
import { api } from '@/lib/axios'

export const examApi = {
    list: (params: ExamListParams) =>
        api.get<Paginated<Exam>>('/exams', { params })
            .then(r => r.data),

    create: (dto: CreateExamDto) =>
        api.post<Exam>('/exams', dto)
            .then(r => r.data),

    publish: (id: string) =>
        api.post(`/exams/${id}/publish`),

    submitAnswer: (dto: SubmitAnswerDto) =>
        api.post(`/submissions/${dto.sessionId}/answers`,
            dto),

    finishExam: (sessionId: string) =>
        api.post<ExamResult>(
            `/submissions/${sessionId}/finish`),
};

// axios.ts — instance dengan interceptor auth
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization =
        `Bearer ${token}`;
    return config;
});
