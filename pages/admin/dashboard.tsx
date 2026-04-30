import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminDashboardPage() {
  return (
    <AdminLayout activeTab="dashboard">
      <AdminDashboardClient />
    </AdminLayout>
  );
}
