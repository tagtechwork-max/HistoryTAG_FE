import api from "./client";
import { getAllTickets, type TicketResponseDTO } from "./ticket.api";

export type DevSentTicketSummary = {
  id: number;
  title: string;
  hospitalName?: string | null;
  ticketType?: string | null;
  ticketTypeLabel?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  priority?: string | null;
  priorityLabel?: string | null;
  requesterAcknowledged?: boolean;
  devHandlerName?: string | null;
  deadline?: string | null;
  createdAt?: string | null;
};

export type TicketStatisticsData = {
  devSentTickets: DevSentTicketSummary[];
  hospitalTickets: TicketResponseDTO[];
};

export async function fetchAllDevSentTickets(): Promise<DevSentTicketSummary[]> {
  const all: DevSentTicketSummary[] = [];
  let page = 0;
  const size = 200;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
      sortBy: "id",
      sortDir: "desc",
    });
    const res = await api.get(`/api/v1/admin/dev-sent-tickets?${params}`);
    const content = Array.isArray(res.data?.content) ? res.data.content : [];
    all.push(...content);
    const totalPages = Math.max(1, Number(res.data?.totalPages) || 1);
    page += 1;
    if (page >= totalPages) break;
  }

  return all;
}

export async function fetchTicketStatisticsData(): Promise<TicketStatisticsData> {
  const [devSentTickets, hospitalTickets] = await Promise.all([
    fetchAllDevSentTickets().catch(() => [] as DevSentTicketSummary[]),
    getAllTickets().catch(() => [] as TicketResponseDTO[]),
  ]);
  return { devSentTickets, hospitalTickets };
}
