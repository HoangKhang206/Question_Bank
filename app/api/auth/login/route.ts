import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const APP_PASSWORD = process.env.APP_PASSWORD!;

export async function POST(req: Request) {
  const { password } = await req.json();

  if (password !== APP_PASSWORD) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }

  const token = await new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);

  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/'
  });
  return res;
}
