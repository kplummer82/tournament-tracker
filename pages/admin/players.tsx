import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPlayersClient from "@/components/admin/AdminPlayersClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminPlayersPage() {
  return (
    <AdminLayout activeTab="players">
      <AdminPlayersClient />
    </AdminLayout>
  );
}
