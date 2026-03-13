import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminSimulationsClient from "@/components/admin/AdminSimulationsClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminSimulationsPage() {
  return (
    <AdminLayout activeTab="simulations">
      <p className="text-muted-foreground mb-6">
        Configure simulation limits for scenario analysis.
      </p>
      <AdminSimulationsClient />
    </AdminLayout>
  );
}
