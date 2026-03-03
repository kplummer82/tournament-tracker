import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  if (session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { redirect: { destination: "/admin/users", permanent: false } };
};

export default function AdminIndexPage() {
  return null;
}
