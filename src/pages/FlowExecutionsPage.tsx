import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';

interface FlowExecution {
  id: number;
  execution_id: string;
  site_id: number | null;
  site_name: string | null;
  status: string;
  final_url: string | null;
  created_at: string;
  updated_at: string;
}

interface FlowLog {
  id: number;
  execution_id: string;
  step: string;
  status: string;
  timestamp: string;
  data: string;
}

export default function FlowExecutionsPage() {
  const { token } = useAuth();
  const [executions, setExecutions] = useState<FlowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, FlowLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/flow-executions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Falha ao carregar execuções');
      
      const data = await response.json();
      setExecutions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (executionId: string) => {
    if (logs[executionId]) return; // Already loaded

    try {
      setLoadingLogs(prev => ({ ...prev, [executionId]: true }));
      const response = await fetch(`/api/flow-executions/${executionId}/logs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Falha ao carregar logs');
      
      const data = await response.json();
      setLogs(prev => ({ ...prev, [executionId]: data }));
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(prev => ({ ...prev, [executionId]: false }));
    }
  };

  useEffect(() => {
    fetchExecutions();
  }, [token]);

  const toggleExecution = (executionId: string) => {
    if (expandedExecution === executionId) {
      setExpandedExecution(null);
    } else {
      setExpandedExecution(executionId);
      fetchLogs(executionId);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'processing': return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default: return <Clock className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Concluído</span>;
      case 'error': return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">Erro</span>;
      case 'processing': return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Processando</span>;
      default: return <span className="px-2 py-1 text-xs font-medium rounded-full bg-zinc-100 text-zinc-800">{status}</span>;
    }
  };

  const formatStepName = (step: string) => {
    const stepMap: Record<string, string> = {
      'input_received': 'Recebimento dos Dados',
      'data_processing': 'Processamento dos Dados',
      'html_generation': 'Geração do HTML',
      'sending_to_flowpost': 'Envio para FlowPost',
      'flowpost_response': 'Resposta do FlowPost',
      'completed': 'Finalização'
    };
    return stepMap[step] || step;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Execuções do FlowAI</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acompanhe o status e os logs das gerações de sites automatizadas.
          </p>
        </div>
        <button
          onClick={fetchExecutions}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
          </div>
        ) : executions.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="mx-auto h-12 w-12 text-zinc-400" />
            <h3 className="mt-2 text-sm font-medium text-zinc-900">Nenhuma execução</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Nenhum log de execução do FlowAI foi recebido ainda.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {executions.map((execution) => (
              <li key={execution.id} className="block hover:bg-zinc-50">
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExecution(execution.execution_id)}>
                    <div className="flex items-center">
                      {getStatusIcon(execution.status)}
                      <p className="ml-3 text-sm font-medium text-zinc-900 truncate">
                        {execution.site_name || 'Site Desconhecido'}
                      </p>
                      <p className="ml-2 text-xs text-zinc-500 font-mono">
                        {execution.execution_id.substring(0, 8)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(execution.status)}
                      <div className="text-sm text-zinc-500">
                        {new Date(execution.created_at).toLocaleString('pt-BR')}
                      </div>
                      {expandedExecution === execution.execution_id ? (
                        <ChevronDown className="w-5 h-5 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-zinc-400" />
                      )}
                    </div>
                  </div>

                  {expandedExecution === execution.execution_id && (
                    <div className="mt-4 pl-8 border-l-2 border-zinc-100 ml-2">
                      {execution.final_url && (
                        <div className="mb-4">
                          <a
                            href={execution.final_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Visualizar Site Final
                          </a>
                        </div>
                      )}

                      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Timeline de Execução</h4>
                      
                      {loadingLogs[execution.execution_id] ? (
                        <div className="flex items-center text-sm text-zinc-500">
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Carregando logs...
                        </div>
                      ) : logs[execution.execution_id]?.length > 0 ? (
                        <div className="space-y-6">
                          {logs[execution.execution_id].map((log, index) => {
                            let parsedData: any = {};
                            try {
                              parsedData = JSON.parse(log.data);
                            } catch (e) {}

                            return (
                              <div key={log.id} className="relative">
                                {index !== logs[execution.execution_id].length - 1 && (
                                  <span className="absolute top-5 left-2.5 -ml-px h-full w-0.5 bg-zinc-200" aria-hidden="true"></span>
                                )}
                                <div className="relative flex items-start space-x-3">
                                  <div className="relative">
                                    <span className="h-5 w-5 rounded-full flex items-center justify-center ring-8 ring-white bg-white">
                                      {getStatusIcon(log.status)}
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div>
                                      <div className="text-sm">
                                        <span className="font-medium text-zinc-900">{formatStepName(log.step)}</span>
                                      </div>
                                      <p className="mt-0.5 text-xs text-zinc-500">
                                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                                      </p>
                                    </div>
                                    <div className="mt-2 text-sm text-zinc-700">
                                      {parsedData.message && <p className="mb-2 font-medium">{parsedData.message}</p>}
                                      {parsedData.error && <p className="mb-2 text-red-600 font-medium">Erro: {parsedData.error}</p>}
                                      
                                      <details className="group">
                                        <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                                          Ver detalhes técnicos (JSON)
                                        </summary>
                                        <pre className="mt-2 text-xs bg-zinc-50 p-3 rounded-md overflow-x-auto border border-zinc-200">
                                          {JSON.stringify(parsedData, null, 2)}
                                        </pre>
                                      </details>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">Nenhum log detalhado encontrado.</p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
