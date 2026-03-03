import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminBracketsClient from "@/components/admin/AdminBracketsClient";

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

export default function AdminBracketsPage() {
  return (
    <AdminLayout activeTab="brackets">
      <p className="text-muted-foreground mb-6">
        Create, edit, and delete system bracket templates. These appear in the library for all users.
      </p>
      <AdminBracketsClient />
    </AdminLayout>
  );
}
