import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Users from "./pages/users";
import Approvals from "./pages/approvals";
import Reports from "./pages/reports";
import Orders from "./pages/orders";
import Wallet from "./pages/wallet";
import Profile from "./pages/profile";
import ProtectedRoute from "./components/protectedRoute";
import AdminLayout from "./components/adminLayout";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/users" element={<Users />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
