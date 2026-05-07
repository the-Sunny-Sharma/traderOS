package com.traderos.api.domain.enums;

public enum BrokerName {
    ZERODHA, GROWW, UPSTOX, DHAN, ANGELONE;

    public String toLowerCase() {
        return name().toLowerCase();
    }
}
