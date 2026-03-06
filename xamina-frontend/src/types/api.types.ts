export type Role = "admin" | "guru" | "siswa" | "super_admin";

export interface ApiSuccess<T> {
    success: true;
    data: T;
}

export interface ApiSuccessWithMeta<T, M> {
    success: true;
    data: T;
    meta: M;
}

export type KnownErrorCode =
    | "VALIDATION_ERROR"
    | "PUBLISH_FAILED"
    | "ATTACH_FAILED"
    | "ATTEMPT_FINALIZED"
    | "EXAM_NOT_AVAILABLE"
    | "SUBMISSION_FINISHED"
    | "SUBMISSION_NOT_FINISHED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "DB_ERROR"
    | "CLASS_IN_USE"
    | "UPLOAD_FAILED"
    | "TENANT_QUOTA_EXCEEDED"
    | "RATE_LIMITED"
    | "UNKNOWN";

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details: unknown;
    };
}

export type ApiError = ApiErrorResponse;

export interface AuthUser {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: Role;
    class_id: string | null;
}

export interface AuthTokenPair {
    access_token: string;
    refresh_token: string;
}

export interface LoginRequest {
    email: string;
    password: string;
    tenant_slug?: string;
}

export interface LoginResponse extends AuthTokenPair {
    user: AuthUser;
}

export interface PageMeta {
    page: number;
    page_size: number;
    total: number;
}

export interface UserDto {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: Role;
    class_id: string | null;
    is_active: boolean;
}

export interface UserListQuery {
    page?: number;
    page_size?: number;
    search?: string;
    role?: Role;
    is_active?: boolean;
    class_id?: string;
}

export interface CreateUserDto {
    email: string;
    name: string;
    role: Role;
    class_id?: string;
    password?: string;
}

export interface UpdateUserDto {
    email?: string;
    name?: string;
    role?: Role;
    class_id?: string;
    is_active?: boolean;
}

export interface ClassDto {
    id: string;
    tenant_id: string;
    name: string;
    grade: string | null;
    major: string | null;
    is_active: boolean;
}

export interface CreateClassDto {
    name: string;
    grade?: string;
    major?: string;
}

export interface UpdateClassDto {
    name?: string;
    grade?: string;
    major?: string;
    is_active?: boolean;
}

export interface CsvImportResult {
    inserted: number;
    failed: number;
    errors: Array<{ line: number; reason: string }>;
}

export type QuestionType = "multiple_choice" | "true_false" | "short_answer";

export interface QuestionOption {
    id: string;
    label: string;
}

export interface QuestionDto {
    id: string;
    tenant_id: string;
    created_by: string;
    type: QuestionType;
    content: string;
    options_jsonb: unknown;
    answer_key: unknown;
    topic: string | null;
    difficulty: string | null;
    image_url: string | null;
    is_active: boolean;
}

export interface CreateQuestionDto {
    type: QuestionType;
    content: string;
    options_jsonb?: unknown;
    answer_key: unknown;
    topic?: string;
    difficulty?: string;
    image_url?: string;
    is_active?: boolean;
}

export interface UpdateQuestionDto extends CreateQuestionDto {}

export interface QuestionListQuery {
    page?: number;
    page_size?: number;
    search?: string;
    topic?: string;
    difficulty?: string;
    type?: QuestionType;
}

export interface QuestionBulkDeleteDto {
    ids: string[];
}

export type ExamStatus = "draft" | "published";

export interface ExamDto {
    id: string;
    tenant_id: string;
    created_by: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    pass_score: number;
    status: ExamStatus;
    shuffle_questions: boolean;
    shuffle_options: boolean;
    start_at: string | null;
    end_at: string | null;
}

export interface CreateExamDto {
    title: string;
    description?: string;
    duration_minutes: number;
    pass_score?: number;
    shuffle_questions?: boolean;
    shuffle_options?: boolean;
    start_at?: string;
    end_at?: string;
}

export interface UpdateExamDto extends CreateExamDto {}

export interface AttachQuestionsDto {
    question_ids: string[];
}

export interface PublishExamDto {
    id: string;
}

export interface UploadImageResponse {
    image_url: string;
}

export interface PublishPrecheckIssue {
    code: string;
    message: string;
    details?: {
        conflicting_exams?: Array<{
            id: string;
            title: string;
            start_at: string;
            end_at: string;
        }>;
    };
}

export interface PublishPrecheckResult {
    exam_id: string;
    publishable: boolean;
    status: ExamStatus | string;
    question_count: number;
    issues: PublishPrecheckIssue[];
}

export interface ReorderExamQuestionsDto {
    question_ids: string[];
}

export interface ReorderExamQuestionsResponse {
    exam_id: string;
    questions: Array<{
        question_id: string;
        order_no: number;
    }>;
}

export type SubmissionStatus = "in_progress" | "finished" | "auto_finished";
export type StudentExamProgressStatus = "not_started" | "in_progress" | "finished";

export interface StudentExamListItem {
    exam_id: string;
    title: string;
    start_at: string | null;
    end_at: string | null;
    duration_minutes: number;
    pass_score: number;
    submission_id: string | null;
    submission_status: StudentExamProgressStatus;
    can_start: boolean;
}

export interface SessionQuestionDto {
    question_id: string;
    type: QuestionType;
    content: string;
    options_jsonb: unknown;
    topic: string | null;
    difficulty: string | null;
    image_url: string | null;
}

export interface SubmissionAnswerDto {
    question_id: string;
    answer_jsonb: unknown;
    is_bookmarked: boolean;
    updated_at: string;
}

export interface SubmissionSessionDto {
    submission_id: string;
    exam_id: string;
    exam_title: string;
    status: SubmissionStatus;
    started_at: string;
    deadline_at: string;
    finished_at: string | null;
    remaining_seconds: number;
    questions: SessionQuestionDto[];
    answers: SubmissionAnswerDto[];
}

export interface StartSubmissionDto {
    submission_id: string;
    status: SubmissionStatus;
    remaining_seconds: number;
    resumed: boolean;
}

export interface SubmissionAnswerInput {
    question_id: string;
    answer?: unknown;
    is_bookmarked?: boolean;
}

export interface SubmissionResultItem {
    question_id: string;
    question_type: QuestionType | string;
    is_correct: boolean;
    submitted_answer: unknown;
}

export interface SubmissionResultDto {
    submission_id: string;
    exam_id: string;
    status: SubmissionStatus;
    score: number;
    correct_count: number;
    total_questions: number;
    pass_score: number;
    passed: boolean;
    finished_at: string | null;
    breakdown: SubmissionResultItem[];
}

export interface AnomalyEventDto {
    event_type: string;
    payload_jsonb?: unknown;
}

export interface TrendPointDto {
    day: string;
    submissions: number;
    avg_score: number;
    pass_rate: number;
}

export interface DashboardAdminSummaryDto {
    role: "admin";
    users_total: number;
    classes_total: number;
    exams_total: number;
    submissions_total: number;
    avg_score: number;
    pass_rate: number;
    trend_7d: TrendPointDto[];
}

export interface DashboardGuruSummaryDto {
    role: "guru";
    exams_total: number;
    published_exams_total: number;
    submissions_total: number;
    avg_score: number;
    pass_rate: number;
    trend_7d: TrendPointDto[];
}

export interface StudentRecentResultDto {
    exam_id: string;
    exam_title: string;
    status: SubmissionStatus;
    score: number;
    finished_at: string | null;
}

export interface StudentUpcomingExamDto {
    exam_id: string;
    title: string;
    start_at: string | null;
    end_at: string | null;
}

export interface DashboardSiswaSummaryDto {
    role: "siswa";
    in_progress_count: number;
    finished_count: number;
    avg_score: number;
    recent_results: StudentRecentResultDto[];
    upcoming_exams: StudentUpcomingExamDto[];
}

export type DashboardSummaryDto =
    | DashboardAdminSummaryDto
    | DashboardGuruSummaryDto
    | DashboardSiswaSummaryDto;

export interface DashboardStatsTenantDto {
    users_count: number;
    users_quota: number;
    ai_credits_used: number;
    ai_credits_quota: number;
}

export interface DashboardStatsDto {
    tenant: DashboardStatsTenantDto;
}

export interface ClassResultRow {
    class_id: string | null;
    class_name: string | null;
    grade: string | null;
    major: string | null;
    exam_id: string;
    exam_title: string;
    submission_count: number;
    avg_score: number;
    pass_rate: number;
    last_submission_at: string | null;
}

export interface ClassResultQuery {
    page?: number;
    page_size?: number;
    class_id?: string;
    exam_id?: string;
}

export interface NotificationDto {
    id: string;
    tenant_id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    payload_jsonb: unknown;
    is_read: boolean;
    created_at: string;
    read_at: string | null;
}

export interface NotificationListMeta {
    page: number;
    page_size: number;
    total: number;
    unread_count: number;
}

export interface CertificateDto {
    id: string;
    tenant_id: string;
    submission_id: string;
    exam_id: string;
    student_id: string;
    certificate_no: string;
    score: number;
    issued_at: string;
    file_url: string;
}

export interface CertificateListMeta {
    page: number;
    page_size: number;
    total: number;
}

export interface BroadcastNotificationRequest {
    title: string;
    message: string;
    target_roles?: Array<"admin" | "guru" | "siswa">;
    target_user_ids?: string[];
    send_push?: boolean;
}

export interface BroadcastNotificationResult {
    targeted_users: number;
    created_notifications: number;
    enqueued_push_jobs: number;
    push_job_ids: string[];
}

export interface PushSubscriptionPayload {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    user_agent?: string;
}

export interface TenantDto {
    id: string;
    name: string;
    slug: string;
    plan: string;
    is_active: boolean;
    users_quota: number;
    ai_credits_quota: number;
    ai_credits_used: number;
    users_count: number;
    created_at: string;
    updated_at: string;
}

export interface TenantListQuery {
    page?: number;
    page_size?: number;
    search?: string;
}

export interface CreateTenantDto {
    name: string;
    slug: string;
    plan?: string;
    users_quota?: number;
    ai_credits_quota?: number;
}

export interface UpdateTenantDto {
    name?: string;
    slug?: string;
    plan?: string;
    is_active?: boolean;
    users_quota?: number;
    ai_credits_quota?: number;
    ai_credits_used?: number;
}
