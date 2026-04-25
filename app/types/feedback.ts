/** Shared shape for POST /api/feedback (client + server). */
export type FeedbackPayload = {
  rating: number;
  category: string;
  message: string;
  page: string;
};
