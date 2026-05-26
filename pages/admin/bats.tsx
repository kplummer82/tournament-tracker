import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminBatsClient from "@/components/admin/AdminBatsClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminBatsPage() {
  return (
    <AdminLayout activeTab="bats">
      <p className="text-muted-foreground mb-6">
        Manage bats (e.g. USSSA, USA Baseball, Wood). Each bat is scoped to a sport and can be referenced by tournaments and scrimmage listings.
      </p>
      <AdminBatsClient />
    </AdminLayout>
  );
};
