import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminScrimmageBatsClient from "@/components/admin/AdminScrimmageBatsClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminScrimmageBatsPage() {
  return (
    <AdminLayout activeTab="scrimmage-bats">
      <p className="text-muted-foreground mb-6">
        Manage bat certifications used in the scrimmage marketplace (e.g. USSSA, USA Baseball, Wood). Each bat is scoped to a sport.
      </p>
      <AdminScrimmageBatsClient />
    </AdminLayout>
  );
};
