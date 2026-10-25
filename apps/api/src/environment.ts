export function isLocalEnvironment(): boolean {
  if (
    process.env.WEBSITE_INSTANCE_ID ||
    process.env.WEBSITE_HOSTNAME ||
    process.env.NODE_ENV === "production" ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Production"
  )
    return false;
  return (
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "development" ||
    process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development"
  );
}
