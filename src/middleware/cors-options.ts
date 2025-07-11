import { CorsOptions } from "cors";

export const CORS_REJECTION_MESSAGE =
  "To use Replyke in production, make sure to whitelist your domain in the dashboard.";

// Regex to match *.replyke.com and *.localhost
const isAllowedDomain = (origin: string) => {
  try {
    const { hostname } = new URL(origin);

    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "replyke.com" ||
      hostname.endsWith(".replyke.com") ||
      hostname === "replyke-dash.pages.dev" ||
      hostname.endsWith(".replyke-dash.pages.dev")
    );
  } catch (err) {
    return false; // Malformed origin
  }
};

const corsOptions: CorsOptions = {
  origin: async (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string | string[]) => void
  ) => {
    if (!origin || isAllowedDomain(origin)) {
      return callback(null, true);
    }

    const error = new Error(`${CORS_REJECTION_MESSAGE} (Origin: ${origin})`);
    callback(error);
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

export default corsOptions;
