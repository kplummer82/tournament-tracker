import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";

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

export default function AdminRolesPage() {
  return (
    <AdminLayout activeTab="roles">
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-muted-foreground">
        <p className="font-medium">Role Management</p>
        <p className="mt-1 text-sm">
          Assign authorizations for specific areas of the app to roles. This will be built out later.
        </p>
      </div>
    </AdminLayout>
  );
}
