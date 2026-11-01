const LOCAL_BACKEND_URL =
  /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

export const resolveBackendUrl = (
  backendUrl: string | undefined,
  isProduction: boolean
) => {
  if (isProduction && (!backendUrl || LOCAL_BACKEND_URL.test(backendUrl))) {
    return '/api';
  }

  return backendUrl || 'http://localhost:3000';
};
