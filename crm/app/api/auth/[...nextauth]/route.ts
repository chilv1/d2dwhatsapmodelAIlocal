/**
 * NextAuth API route — handle GET/POST cho mọi sub-path /api/auth/*
 * (signin, signout, callback, session, csrf, providers)
 */
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
