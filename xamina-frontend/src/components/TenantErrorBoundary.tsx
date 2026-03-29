import React, { Component, ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    errorStr?: string;
}

export class TenantErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, errorStr: error.message };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Tenant Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="card text-center" style={{ maxWidth: 720, margin: "0 auto" }}>
                    <p className="section-eyebrow">Runtime Guard</p>
                    <div className="stack gap-sm">
                        <h1 className="section-title">Terjadi Kesalahan Aplikasi</h1>
                        <p className="text-dimmed">Ada komponen yang gagal dimuat dalam tenant Anda.</p>
                        {this.state.errorStr && (
                            <div className="surface-muted p-sm text-xs" style={{ overflow: "auto", textAlign: "left" }}>
                                <code>{this.state.errorStr}</code>
                            </div>
                        )}
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                this.setState({ hasError: false, errorStr: undefined });
                                window.location.reload();
                            }}
                        >
                            Muat Ulang Halaman
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
