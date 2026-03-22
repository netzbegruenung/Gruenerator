import { Navigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../hooks/useAuth';

const AdminDashboardPage = () => {
  const { user } = useOptimizedAuth();

  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  return (
    <ErrorBoundary>
      <PageContainer title="Admin Dashboard">
        <div className="flex flex-col items-center justify-center gap-md py-2xl">
          <div className="rounded-lg bg-background-alt p-2xl text-center">
            <p className="text-2xl font-semibold text-foreground-heading">Coming soon</p>
            <p className="mt-sm text-foreground-muted">
              Das Admin-Dashboard wird gerade entwickelt.
            </p>
          </div>
        </div>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(AdminDashboardPage, {
  title: 'Admin Dashboard',
});
