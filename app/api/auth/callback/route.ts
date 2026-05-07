import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Whitelist check using service role (bypasses RLS)
  const service = createServiceClient();
  const { data: allowed } = await service
    .from('allowed_emails')
    .select('email')
    .eq('email', data.user.email)
    .single();

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
  }

  return NextResponse.redirect(`${origin}/ghostwriter`);
}
