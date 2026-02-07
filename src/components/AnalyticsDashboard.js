"use client";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { Clock, Bug, ShoppingCart, FileText, Github, Zap, Award } from "lucide-react";

export default function AnalyticsDashboard({ sessionId }) {
  const [stats, setStats] = useState({
    totalAnalyses: 0,
    totalBugsFound: 0,
    totalComponents: 0,
    avgAnalysisTime: 0,
    timeSaved: 0,
    moneySaved: 0,
    githubCommits: 0,
    recentProjects: [],
  });

  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    try {
      const conversationsRef = collection(db, "conversations");

      // Requête pour tous les chats de l'utilisateur
      const q = query(
        conversationsRef,
        where("sessionId", "==", sessionId),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Calculate metrics
      const totalAnalyses = conversations.length;
      const totalBugsFound = conversations.reduce((sum, chat) => {
        if (chat.bugsDetected && chat.bugsDetected.stats) {
          return sum + (chat.bugsDetected.stats.total || 0);
        }
        return sum;
      }, 0);
      const totalComponents = conversations.reduce(
        (sum, chat) => sum + (chat.componentCount || 0),
        0
      );
      const githubCommits = conversations.filter((chat) => chat.hasGithubUrl).length;

      // Average analysis time (estimated at 25s per analysis)
      const avgAnalysisTime = 25;

      // Calculate time saved
      // Without CircuitVision: 2-3h manual documentation per project
      // With CircuitVision: 25 seconds
      const manualTimePerProject = 2.5 * 60 * 60; // 2.5h in seconds
      const aiTimePerProject = 25; // seconds
      const timeSavedPerProject = manualTimePerProject - aiTimePerProject;
      const totalTimeSaved = (timeSavedPerProject * totalAnalyses) / 3600; // in hours

      // Money saved (estimate: $50/h consultant)
      const moneySaved = totalTimeSaved * 50;

      // Recent projects
      const recentProjects = conversations.slice(0, 5).map((conversation) => ({
        id: conversation.id,
        query: conversation.userQuery?.substring(0, 60) + "...",
        bugs: conversation.bugsDetected || 0,
        components: conversation.componentCount || 0,
        hasGithub: conversation.hasGithubUrl,
        createdAt: conversation.createdAt?.toDate?.() || new Date(),
      }));

      setStats({
        totalAnalyses,
        totalBugsFound,
        totalComponents,
        avgAnalysisTime,
        timeSaved: Math.round(totalTimeSaved * 10) / 10,
        moneySaved: Math.round(moneySaved),
        githubCommits,
        recentProjects,
      });

      setLoading(false);
    } catch (error) {
      console.error("Analytics loading error:", error);
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">📊 Dashboard</h2>
          <p className="text-sm text-gray-400">Your statistics</p>
        </div>
        <button
          onClick={loadAnalytics}
          className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
        >
          ↻
        </button>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard icon={FileText} label="Analyses" value={stats.totalAnalyses} color="blue" />
        <MetricCard icon={Bug} label="Bugs" value={stats.totalBugsFound} color="red" />
        <MetricCard
          icon={ShoppingCart}
          label="Components"
          value={stats.totalComponents}
          color="green"
        />
        <MetricCard icon={Github} label="GitHub" value={stats.githubCommits} color="purple" />
      </div>

      {/* Economic impact */}
      <div className="grid grid-cols-2 gap-2">
        <ImpactCard
          icon={Clock}
          title="Time Saved"
          value={`${stats.timeSaved}h`}
          subtitle={`vs ${stats.totalAnalyses * 2.5}h manual`}
          percentage={95}
          color="blue"
        />
        <ImpactCard
          icon={Award}
          title="Savings"
          value={`${stats.moneySaved}`}
          subtitle="At $50/h"
          percentage={100}
          color="green"
        />
      </div>

      {/* Performance */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Zap className="w-5 h-5 text-yellow-400" />
          <span className="text-white font-medium">Performance</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-purple-400">{stats.avgAnalysisTime}s</p>
            <p className="text-xs text-gray-400">Time</p>
          </div>
          <div>
            <p className="text-xl font-bold text-red-400">
              {stats.totalBugsFound > 0
                ? Math.round((stats.totalBugsFound / stats.totalAnalyses) * 10) / 10
                : 0}
            </p>
            <p className="text-xs text-gray-400">Bugs/project</p>
          </div>
          <div>
            <p className="text-xl font-bold text-green-400">
              {stats.totalComponents > 0
                ? Math.round((stats.totalComponents / stats.totalAnalyses) * 10) / 10
                : 0}
            </p>
            <p className="text-xs text-gray-400">Components</p>
          </div>
        </div>
      </div>

      {/* Recent projects */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-700 border-b border-gray-600">
          <h3 className="text-sm font-medium text-white">Recent Projects</h3>
        </div>
        <div className="divide-y divide-gray-700">
          {stats.recentProjects.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">No projects yet</div>
          ) : (
            stats.recentProjects.map((project) => <ProjectRow key={project.id} project={project} />)
          )}
        </div>
      </div>
    </div>
  );
}

// Composant Metric Card
function MetricCard({ icon: Icon, label, value, color }) {
  const colorClasses = {
    blue: "bg-blue-600",
    red: "bg-red-600",
    green: "bg-green-600",
    purple: "bg-purple-600",
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div
        className={`w-8 h-8 ${colorClasses[color]} rounded-lg flex items-center justify-center mb-2`}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

// Composant Impact Card
function ImpactCard({ icon: Icon, title, value, subtitle, percentage, color }) {
  const colorClasses = {
    blue: { bg: "bg-blue-600", text: "text-blue-400", bar: "bg-blue-600" },
    green: { bg: "bg-green-600", text: "text-green-400", bar: "bg-green-600" },
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorClasses[color].text}`} />
        <span className="text-sm text-gray-400">{title}</span>
      </div>
      <p className={`text-xl font-bold ${colorClasses[color].text}`}>{value}</p>
      <p className="text-xs text-gray-500 mb-2">{subtitle}</p>
      <div className="w-full bg-gray-700 rounded-full h-1.5">
        <div
          className={`${colorClasses[color].bar} h-1.5 rounded-full`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

// Composant Project Row
function ProjectRow({ project }) {
  const formatDate = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return "Now";
  };

  return (
    <div className="px-4 py-3 hover:bg-gray-700 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{project.query}</p>
          <p className="text-xs text-gray-500">{formatDate(project.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {project.bugs > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <Bug className="w-3 h-3" />
              <span className="text-xs">{project.bugs}</span>
            </div>
          )}
          {project.components > 0 && (
            <div className="flex items-center gap-1 text-green-400">
              <ShoppingCart className="w-3 h-3" />
              <span className="text-xs">{project.components}</span>
            </div>
          )}
          {project.hasGithub && <Github className="w-3 h-3 text-purple-400" />}
        </div>
      </div>
    </div>
  );
}
