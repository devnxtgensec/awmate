// Modified for AWMate: the two gateways an account can be granted, in the order the pickers list them.
export const gatewayOrder = ["awmate", "opencode"]

export const isGateway = (providerID: string | undefined) => providerID === "awmate" || providerID === "opencode"
