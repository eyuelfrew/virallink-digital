import {
  LayoutDashboard, FileStack, Users, Wallet, Settings, Briefcase, FolderKanban,
  Newspaper, Inbox, UserRound, Building2, PieChart, ArrowLeftRight, ReceiptText,
  ChartColumn, Building, Image, ShieldCheck, History, ListTodo, FolderOpen,
  Target, Mail, Phone, MapPin, UserPlus, Calendar, Tag, ListChecks,
} from 'lucide-react';

/**
 * Icon name to component map.
 *
 * Icons cross the Server -> Client boundary by *name*, never by component. A
 * component is a function carrying methods, and passing one as a prop to a Client
 * Component fails: "Only plain objects can be passed to Client Components from
 * Server Components." Passing a string is serialisable, and the Client Component
 * resolves it here.
 *
 * The admin nav in @virallink/shared already ships icon names for exactly this
 * reason, so page configs follow the same convention.
 */
export const ICONS = {
  LayoutDashboard, FileStack, Users, Wallet, Settings,
  Briefcase, FolderKanban, Newspaper, Inbox, UserRound, Building2, PieChart,
  ArrowLeftRight, ReceiptText, ChartColumn, Building, Image, ShieldCheck, History,
  ListTodo, FolderOpen, Target, Mail, Phone, MapPin, UserPlus, Calendar, Tag,
  ListChecks,
};

/** Render an icon by name. Unknown or missing names fall back to a neutral glyph. */
export function NavIcon({ name, className }) {
  const Icon = (name && ICONS[name]) || FileStack;
  return <Icon className={className} aria-hidden="true" />;
}

export default ICONS;