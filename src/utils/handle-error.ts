import axios from "axios";

export default function (err: unknown, action: string) {
  if (axios.isAxiosError(err)) {
    const { data, status } = err.response || {};
    console.error(`Replyke SDK Error (${action}):`, {
      status,
      code: data?.code,
      message: data?.error,
    });
  } else {
    console.error(`Unknown error (${action}):`, err);
  }
}
