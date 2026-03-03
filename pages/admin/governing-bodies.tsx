import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminGoverningBodiesClient from "@/components/admin/AdminGoverningBodiesClient";

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

export default function AdminGoverningBodiesPage() {
  return (
    <AdminLayout activeTab="governing-bodies">
      <p className="text-muted-foreground mb-6">
        Create and manage governing bodies (e.g. PONY, Little League International). These are available when creating leagues.
      </p>
      <AdminGoverningBodiesClient />
    </AdminLayout>
  );
}
