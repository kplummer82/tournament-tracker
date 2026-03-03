import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminUsersClient from "@/components/admin/AdminUsersClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user) {
    return { redirect: { destination: "/login", permanent: false } };
  }
  if (session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminUsersPage() {
  return (
    <AdminLayout activeTab="users">
      <p className="text-muted-foreground mb-6">
        Add or remove admin privileges for users. New users start as standard users.
      </p>
      <AdminUsersClient />
    </AdminLayout>
  );
}
