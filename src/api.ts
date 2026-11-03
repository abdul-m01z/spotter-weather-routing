export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. Please retry.",
    );
  }
  if (!response.ok)
    throw new ApiError(
      data.error?.message || "Something went wrong. Please retry.",
      data.error?.fields,
    );
  return data as T;
}
