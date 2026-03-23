import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminRolesClient from "@/components/admin/AdminRolesClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminRolesPage() {
  return (
    <AdminLayout activeTab="roles">
      <AdminRolesClient />
    </AdminLayout>
  );
}
