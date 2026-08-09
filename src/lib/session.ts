import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { DEMO_USERS } from "./demo-users";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function getCurrentUser(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get("user_id")?.value;

  if (userIdCookie) {
    const user = await prisma.user.findUnique({
      where: { id: userIdCookie },
    });
    if (user) {
      return {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
      };
    }
  }

  // Ensure default demo users exist in database
  let defaultUser = await prisma.user.findUnique({
    where: { email: DEMO_USERS[0].email },
  });

  if (!defaultUser) {
    defaultUser = await prisma.user.create({
      data: {
        email: DEMO_USERS[0].email,
        name: DEMO_USERS[0].name,
      },
    });
  }

  return {
    id: defaultUser.id,
    name: defaultUser.name || defaultUser.email,
    email: defaultUser.email,
  };
}

export async function getOrCreateUserByEmail(email: string, name?: string): Promise<SessionUser> {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email,
      },
    });
  }
  return {
    id: user.id,
    name: user.name || user.email,
    email: user.email,
  };
}
