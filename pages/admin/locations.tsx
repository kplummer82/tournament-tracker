import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminLocationsClient from "@/components/admin/AdminLocationsClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminLocationsPage() {
  return (
    <AdminLayout activeTab="locations">
      <p className="text-muted-foreground mb-6">
        Manage game locations and fields. Locations are shared across all leagues and tournaments.
      </p>
      <AdminLocationsClient />
    </AdminLayout>
  );
}
