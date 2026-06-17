/**
 * IPable API client — wraps the Cloud Run backend.
 */

const DEFAULT_BASE_URL = "https://patentmuse-backend-780141866774.europe-west3.run.app";

export class IPableAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  private async request(path: string, method: string = "GET", body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`IPable API error ${res.status}: ${text}`);
    }

    return res.json();
  }

  // Chat with AI
  async chat(message: string, context: string = ""): Promise<any> {
    return this.request("/api/v1/chat", "POST", { message, context });
  }

  // Citations
  async findSimilarByCitations(pubNum: string, limit: number = 5): Promise<any> {
    return this.request(`/api/v1/citations/similar?pub_num=${encodeURIComponent(pubNum)}&limit=${limit}`);
  }

  // Analytics
  async ipcDistribution(limit: number = 15): Promise<any> {
    return this.request(`/api/v1/analytics/ipc-distribution?limit=${limit}`);
  }

  async companyOverview(name: string): Promise<any> {
    return this.request(`/api/v1/analytics/company/overview?name=${encodeURIComponent(name)}`);
  }

  async companyTechPortfolio(name: string): Promise<any> {
    return this.request(`/api/v1/analytics/company/tech-portfolio?name=${encodeURIComponent(name)}`);
  }

  async companyFilingTrends(name: string): Promise<any> {
    return this.request(`/api/v1/analytics/company/filing-trends?name=${encodeURIComponent(name)}`);
  }

  async marketConcentration(techDomain?: string): Promise<any> {
    const params = techDomain ? `?tech_domain=${encodeURIComponent(techDomain)}` : "";
    return this.request(`/api/v1/analytics/market-concentration${params}`);
  }

  async ftoRisk(techDomain: string): Promise<any> {
    return this.request(`/api/v1/analytics/fto-risk?tech_domain=${encodeURIComponent(techDomain)}`);
  }

  async blockingPatents(techDomain: string): Promise<any> {
    return this.request(`/api/v1/analytics/blocking-patents?tech_domain=${encodeURIComponent(techDomain)}`);
  }

  async researchIntensity(minPatents: number = 20): Promise<any> {
    return this.request(`/api/v1/analytics/research-intensity?min_patents=${minPatents}`);
  }

  async crossDomain(source: string, target: string): Promise<any> {
    return this.request(`/api/v1/analytics/cross-domain?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`);
  }

  async portfolioDiversity(minPatents: number = 20): Promise<any> {
    return this.request(`/api/v1/analytics/portfolio-diversity?min_patents=${minPatents}`);
  }

  async graphStats(): Promise<any> {
    return this.request("/api/v1/analytics/stats");
  }

  // Claim Element Analysis
  async claimElements(pubNum: string): Promise<any> {
    return this.request(`/api/v1/claims/elements/${encodeURIComponent(pubNum)}`);
  }

  async claimOverlap(pubNum: string, minScore: number = 0.85): Promise<any> {
    return this.request(`/api/v1/claims/overlapping/${encodeURIComponent(pubNum)}?min_score=${minScore}`);
  }

  async novelElements(pubNum: string): Promise<any> {
    return this.request(`/api/v1/claims/novel/${encodeURIComponent(pubNum)}`);
  }

  async obviousnessCheck(pubNum: string, claimNumber: number = 1): Promise<any> {
    return this.request(`/api/v1/claims/obviousness/${encodeURIComponent(pubNum)}?claim_number=${claimNumber}`);
  }

  async elementLandscape(techDomain: string, limit: number = 30): Promise<any> {
    return this.request(`/api/v1/claims/landscape/${encodeURIComponent(techDomain)}?limit=${limit}`);
  }

  async searchClaimElements(claimText: string, minScore: number = 0.7): Promise<any> {
    return this.request("/api/v1/claims/search-elements", "POST", { claim_text: claimText, min_score: minScore });
  }

  // Technology Communities (Clusters)
  async classifyPatent(pubNum: string): Promise<any> {
    return this.request(`/api/v1/clusters/classify/${encodeURIComponent(pubNum)}`);
  }

  async findTechnology(query: string): Promise<any> {
    return this.request(`/api/v1/clusters/find?query=${encodeURIComponent(query)}`);
  }

  async listTechnologies(): Promise<any> {
    return this.request("/api/v1/clusters/list");
  }

  async clusterPatents(technology: string, limit: number = 20): Promise<any> {
    return this.request(`/api/v1/clusters/patents?technology=${encodeURIComponent(technology)}&limit=${limit}`);
  }

  async clusterPriorArt(pubNum: string, limit: number = 10): Promise<any> {
    return this.request(`/api/v1/clusters/prior-art/${encodeURIComponent(pubNum)}?limit=${limit}`);
  }

  async assigneeLandscape(technology: string, limit: number = 20): Promise<any> {
    return this.request(`/api/v1/clusters/assignees?technology=${encodeURIComponent(technology)}&limit=${limit}`);
  }

  async technologyFlow(technology: string, limit: number = 20): Promise<any> {
    return this.request(`/api/v1/clusters/flow?technology=${encodeURIComponent(technology)}&limit=${limit}`);
  }

  async technologyTimeline(technology: string): Promise<any> {
    return this.request(`/api/v1/clusters/timeline?technology=${encodeURIComponent(technology)}`);
  }

  async ipcVsCluster(pubNum: string): Promise<any> {
    return this.request(`/api/v1/clusters/ipc-comparison/${encodeURIComponent(pubNum)}`);
  }

  async similarLimitations(elementId: string, limit: number = 10): Promise<any> {
    return this.request(`/api/v1/clusters/similar-limitations/${encodeURIComponent(elementId)}?limit=${limit}`);
  }

  // Subscriptions
  async subscribe(clusterId: number, clusterName: string): Promise<any> {
    return this.request("/api/v1/subscriptions/", "POST", { cluster_id: clusterId, cluster_name: clusterName });
  }

  async unsubscribe(clusterId: string): Promise<any> {
    return this.request(`/api/v1/subscriptions/${encodeURIComponent(clusterId)}`, "DELETE");
  }

  async listSubscriptions(): Promise<any> {
    return this.request("/api/v1/subscriptions/");
  }

  async checkSubscription(clusterId: string): Promise<any> {
    return this.request(`/api/v1/subscriptions/${encodeURIComponent(clusterId)}`);
  }
}
