import { z } from 'zod';

// Define and validate environment variables at runtime. We keep variables optional
// so local development doesn't fail without a .env file, but we still validate
// format when values are provided.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url({ message: 'NEXT_PUBLIC_APP_URL must be a valid URL' })
    .optional(),
  REPLICATE_API_TOKEN: z
    .string()
    .min(1, { message: 'REPLICATE_API_TOKEN cannot be empty when provided' })
    .optional(),
});

const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
};

const parsed = EnvSchema.safeParse(rawEnv);

if (!parsed.success) {
  const formatted = parsed.error.format();
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Invalid environment variables. Please check your deployment configuration.\n${JSON.stringify(
        formatted,
        null,
        2,
      )}`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn('[env] Invalid or missing environment variables (non-fatal in dev):', formatted);
  }
}

export const env = (parsed.success ? parsed.data : (rawEnv as unknown)) as z.infer<
  typeof EnvSchema
>;
