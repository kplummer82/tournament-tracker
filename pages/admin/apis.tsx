import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminApisClient from "@/components/admin/AdminApisClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminApisPage() {
  return (
    <AdminLayout activeTab="apis">
      <p className="text-muted-foreground mb-6">
        Configure third-party API integrations.
      </p>
      <AdminApisClient />
    </AdminLayout>
  );
}
