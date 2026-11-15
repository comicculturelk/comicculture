import { createOrderStatusWorker } from './handler.ts';

Deno.serve(createOrderStatusWorker({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  workerSecret: Deno.env.get('ORDER_STATUS_WORKER_SECRET') ?? '',
  resendApiKey: Deno.env.get('RESEND_API_KEY') ?? '',
  fromEmail: Deno.env.get('RESEND_FROM_EMAIL') ?? '',
  replyTo: Deno.env.get('RESEND_REPLY_TO_EMAIL') || Deno.env.get('ADMIN_NOTIFICATION_EMAIL')?.split(',')[0]?.trim() || '',
  verificationRecipient: Deno.env.get('ORDER_STATUS_VERIFICATION_RECIPIENT'),
}));
