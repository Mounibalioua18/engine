export interface Edge {
  from: string;
  to: string;
  protocol: 'TCP' | 'UDP' | 'RMI';
}

export function parseTopology(input: string): Edge[] {
  const lines = input.split('\n');
  const edges: Edge[] = [];
  lines.forEach((line) => {
    let match = line.match(/(P\d+)\s*-->\|(TCP|UDP|RMI)\|\s*(P\d+)/);
    if (!match) {
      match = line.match(/(P\d+)\s*->\|(TCP|UDP|RMI)\|\s*(P\d+)/);
    }
    if (match) {
      edges.push({ from: match[1], to: match[3], protocol: match[2] as 'TCP' | 'UDP' | 'RMI' });
    }
  });
  return edges;
}

export function extractProcesses(edges: Edge[]): string[] {
  const set = new Set<string>();
  edges.forEach((e) => {
    set.add(e.from);
    set.add(e.to);
  });
  return Array.from(set).sort();
}

function extractRole(roles: string, proc: string): string {
  const lines = roles.split('\n');
  for (const line of lines) {
    if (line.trim().toUpperCase().startsWith(proc.toUpperCase() + ':') || 
        line.trim().toUpperCase().startsWith(proc.toUpperCase() + ' :')) {
      return line.substring(line.indexOf(':') + 1).trim();
    }
  }
  return '';
}

function getPort(proc: string): number {
  const id = parseInt(proc.replace('P', ''), 10);
  return id * 1000 + id; // e.g. 1001, 2002, 3003
}

function getPayloadOfEdge(edge: Edge, roles: string): string {
  const senderRole = extractRole(roles, edge.from);
  
  const regex = new RegExp(`envoyer\\s+([A-Z0-9_]+)\\s+(?:directement\\s+)?(?:a|à)\\s+${edge.to}`, 'i');
  const match = senderRole.match(regex);
  if (match) return match[1];
  
  const genericMatch = senderRole.match(/envoyer\s+([A-Z0-9_]+)/i);
  if (genericMatch) return genericMatch[1];
  
  return 'valeur'; 
}

function generateSendSnippet(edge: Edge, indent: string, valName: string, isRmiContext: boolean): string {
    let code = '';
    const port = getPort(edge.to);
    const ipVar = (isRmiContext ? 'this.' : '') + `IP_${edge.to}`;
    
    if (edge.protocol === 'TCP') {
        code += `${indent}// ── Send ${valName} to ${edge.to} via TCP (port ${port}) ──\n`;
        code += `${indent}try {\n`;
        code += `${indent}    Socket tcp${edge.to} = new Socket(${ipVar}, ${port});\n`;
        code += `${indent}    DataOutputStream out${edge.to} = new DataOutputStream(tcp${edge.to}.getOutputStream());\n`;
        code += `${indent}    out${edge.to}.writeInt(${valName});\n`;
        code += `${indent}    out${edge.to}.close(); tcp${edge.to}.close();\n`;
        code += `${indent}    System.out.println("${edge.from} → ${edge.to} (TCP) : ${valName} = " + ${valName});\n`;
        code += `${indent}} catch (Exception e) {\n`;
        code += `${indent}    System.err.println("Erreur envoi ${edge.from}→${edge.to} : " + e.getMessage());\n`;
        code += `${indent}}\n\n`;
    } else if (edge.protocol === 'UDP') {
        code += `${indent}// ── Send ${valName} to ${edge.to} via UDP (port ${port}) ──\n`;
        code += `${indent}try {\n`;
        code += `${indent}    DatagramSocket ds${edge.to} = new DatagramSocket();\n`;
        code += `${indent}    byte[] data${edge.to} = Integer.toString(${valName}).getBytes();\n`;
        code += `${indent}    InetAddress addr${edge.to} = InetAddress.getByName(${ipVar});\n`;
        code += `${indent}    ds${edge.to}.send(new DatagramPacket(data${edge.to}, data${edge.to}.length, addr${edge.to}, ${port}));\n`;
        code += `${indent}    ds${edge.to}.close();\n`;
        code += `${indent}    System.out.println("${edge.from} → ${edge.to} (UDP) : ${valName} = " + ${valName});\n`;
        code += `${indent}} catch (Exception e) {\n`;
        code += `${indent}    System.err.println("Erreur envoi ${edge.from}→${edge.to} : " + e.getMessage());\n`;
        code += `${indent}}\n\n`;
    } else if (edge.protocol === 'RMI') {
        code += `${indent}// ── Send ${valName} to ${edge.to} via RMI ──\n`;
        code += `${indent}try {\n`;
        code += `${indent}    Registry reg${edge.to} = LocateRegistry.getRegistry(${ipVar}, ${port});\n`;
        code += `${indent}    Interface${edge.to} p${edge.to} = (Interface${edge.to}) reg${edge.to}.lookup("reference${edge.to}");\n`;
        code += `${indent}    p${edge.to}.reception(${valName});\n`;
        code += `${indent}    System.out.println("${edge.from} → ${edge.to} (RMI) : ${valName} = " + ${valName});\n`;
        code += `${indent}} catch (Exception e) {\n`;
        code += `${indent}    System.err.println("Erreur envoi ${edge.from}→${edge.to} : " + e.getMessage());\n`;
        code += `${indent}}\n\n`;
    }
    return code;
}

function getCalculateCode(role: string, proc: string, inEdges: Edge[], roles: string, indent: string = '        '): string {
    let code = '';
    let calcMatch = role.match(/(?:calc[a-z]*|calduler)\s+([A-Z0-9_]+)\s*\(\s*(?:[A-Z0-9_]+\s*=)?\s*((?:[^)(]+|\([^)(]*\))*)\)/i);
    if (!calcMatch) {
       calcMatch = role.match(/(?:calc[a-z]*|calduler)\s+([A-Z0-9_]+)\s*=\s*([^.)\s]+)/i);
    }
    
    if (calcMatch) {
        let varName = calcMatch[1];
        let mathExp = calcMatch[2].trim();
        code += `${indent}// ── Calculate ${varName} ──\n`;

        let receivedVars = inEdges.map(e => getPayloadOfEdge(e, roles).trim());
        let varsInFormula = mathExp.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
        let undefinedVars = new Set<string>();
        for (let v of varsInFormula) {
            if (v !== varName && !receivedVars.includes(v) && !['Math', 'int', 'double'].includes(v)) {
                undefinedVars.add(v);
            }
        }
        undefinedVars.forEach(v => {
            code += `${indent}int ${v} = 0; // FIXME: Valeur manquante (non reçue par le processus)\n`;
        });

        code += `${indent}int ${varName} = ${mathExp};\n`;
        code += `${indent}System.out.println("${proc} calcule ${varName} = ${mathExp} = " + ${varName});\n\n`;
    }
    return code;
}

export function generateOfflineEngine(topology: string, roles: string): Record<string, string> {
  const edges = parseTopology(topology);
  const processes = extractProcesses(edges);
  const files: Record<string, string> = {};

  processes.forEach((p) => {
    let code = '';
    const inEdges = edges.filter((e) => e.to === p);
    const outEdges = edges.filter((e) => e.from === p);
    const pRole = extractRole(roles, p);
    const port = getPort(p);
    
    const isActuallyInitiator = pRole.toLowerCase().includes('lire un entier') || Object.keys(files).length === 0;

    const inRMI = inEdges.filter(e => e.protocol === 'RMI');
    const isRmiServer = inRMI.length > 0;

    const destIPs = Array.from(new Set(outEdges.map(e => e.to))).sort();

    if (isRmiServer) {
      const payload = getPayloadOfEdge(inRMI[0], roles);
      files[`Interface${p}.java`] = `import java.rmi.Remote;\nimport java.rmi.RemoteException;\n\npublic interface Interface${p} extends Remote {\n    void reception(int ${payload}) throws RemoteException;\n}\n`;
    }

    code += `import java.io.*;\nimport java.net.*;\nimport java.rmi.*;\nimport java.rmi.registry.*;\nimport java.rmi.server.*;\nimport java.util.Scanner;\n\n`;

    if (isRmiServer) {
        code += `public class ${p} extends UnicastRemoteObject implements Interface${p} {\n\n`;
        
        destIPs.forEach(d => { code += `    private String IP_${d};\n`; });
        if (destIPs.length > 0) code += `\n`;
        
        const argDefs = destIPs.map(d => `String IP_${d}`).join(', ');
        code += `    public ${p}(${argDefs}) throws RemoteException {\n`;
        destIPs.forEach(d => { code += `        this.IP_${d} = IP_${d};\n`; });
        code += `    }\n\n`;

        const payload = getPayloadOfEdge(inRMI[0], roles);
        code += `    // ← Called via RMI\n`;
        code += `    @Override\n`;
        code += `    public void reception(int ${payload}) throws RemoteException {\n`;
        code += `        System.out.println("${p} reçu ${payload} = " + ${payload});\n\n`;
        
        code += getCalculateCode(pRole, p, inEdges, roles, '        ');
        for (const outEdge of outEdges) {
            const sendPayload = getPayloadOfEdge(outEdge, roles);
            code += generateSendSnippet(outEdge, '        ', sendPayload, true);
        }
        code += `    }\n\n`;

    } else {
        code += `public class ${p} {\n\n`;
    }

    code += `    // Args: ${destIPs.map(d => `<IP_${d}>`).join(' ')}\n`;
    code += `    public static void main(String[] args) throws Exception {\n`;
    
    if (destIPs.length > 0) {
        code += `        if (args.length < ${destIPs.length}) {\n`;
        code += `            System.out.println("Usage: java ${p} " + "${destIPs.map(d => `<IP_${d}>`).join(' ')}");\n`;
        code += `            return;\n`;
        code += `        }\n`;
        destIPs.forEach((d, idx) => {
            code += `        String IP_${d} = args[${idx}];\n`;
        });
        code += `\n`;
    }

    if (isRmiServer) {
        const argsPass = destIPs.map(d => `IP_${d}`).join(', ');
        code += `        ${p} obj = new ${p}(${argsPass});\n`;
        code += `        Registry registry = LocateRegistry.createRegistry(${port});\n`;
        code += `        registry.rebind("reference${p}", obj);\n`;
        code += `        System.out.println("Serveur RMI ${p} prêt (port ${port}), en attente de P" + (${parseInt(p.replace("P", "")) - 1}) + "...");\n`;
    } else {
        if (isActuallyInitiator) {
            let startVar = 'N';
            const lireMatch = pRole.match(/lire un entier\s+([A-Z0-9_]+)/i);
            if (lireMatch) startVar = lireMatch[1];

            code += `        // ── Read ${startVar} from keyboard ──\n`;
            code += `        Scanner sc = new Scanner(System.in);\n`;
            code += `        System.out.print("Donner ${startVar} : ");\n`;
            code += `        int ${startVar} = sc.nextInt();\n\n`;

            for (let i = 0; i < inEdges.length; i++) {
                const inEdge = inEdges[i];
                const payload = getPayloadOfEdge(inEdge, roles);
                if (inEdge.protocol === 'TCP') {
                    code += `        // ── Listen TCP on port ${port + i} (for ${inEdge.from} result) ──\n`;
                    code += `        ServerSocket serverSocket${i} = new ServerSocket(${port + i});\n`;
                    code += `        new Thread(() -> {\n`;
                    code += `            try {\n`;
                    code += `                System.out.println("${p} en attente du résultat ${payload} (TCP port ${port + i})...");\n`;
                    code += `                Socket s = serverSocket${i}.accept();\n`;
                    code += `                DataInputStream in = new DataInputStream(s.getInputStream());\n`;
                    code += `                int ${payload} = in.readInt();\n`;
                    code += `                System.out.println("==============================");\n`;
                    code += `                System.out.println("Résultat final ${payload} = " + ${payload});\n`;
                    code += `                System.out.println("==============================");\n`;
                    code += `                in.close(); s.close(); serverSocket${i}.close();\n`;
                    code += `            } catch (Exception e) {\n`;
                    code += `                e.printStackTrace();\n`;
                    code += `            }\n`;
                    code += `        }).start();\n\n`;
                } else if (inEdge.protocol === 'UDP') {
                    code += `        // ── Listen UDP on port ${port + i} (for ${inEdge.from} result) ──\n`;
                    code += `        DatagramSocket udpServer${i} = new DatagramSocket(${port + i});\n`;
                    code += `        new Thread(() -> {\n`;
                    code += `            try {\n`;
                    code += `                System.out.println("${p} en attente du résultat ${payload} (UDP port ${port + i})...");\n`;
                    code += `                byte[] buf = new byte[1024];\n`;
                    code += `                DatagramPacket pkt = new DatagramPacket(buf, buf.length);\n`;
                    code += `                udpServer${i}.receive(pkt);\n`;
                    code += `                int ${payload} = Integer.parseInt(new String(pkt.getData(), 0, pkt.getLength()).trim());\n`;
                    code += `                System.out.println("==============================");\n`;
                    code += `                System.out.println("Résultat final ${payload} = " + ${payload});\n`;
                    code += `                System.out.println("==============================");\n`;
                    code += `                udpServer${i}.close();\n`;
                    code += `            } catch (Exception e) {\n`;
                    code += `                e.printStackTrace();\n`;
                    code += `            }\n`;
                    code += `        }).start();\n\n`;
                }
            }

            for (const outEdge of outEdges) {
                const payload = getPayloadOfEdge(outEdge, roles);
                code += generateSendSnippet(outEdge, '        ', payload, false);
            }
        } else {
            const hasTCP = inEdges.some(e => e.protocol === 'TCP');
            const hasUDP = inEdges.some(e => e.protocol === 'UDP');

            if (hasTCP) {
                code += `        ServerSocket serverSocket = new ServerSocket(${port});\n`;
            }
            if (hasUDP) {
                code += `        DatagramSocket udpServer = new DatagramSocket(${port});\n`;
            }
            if (hasTCP || hasUDP) {
                code += `        System.out.println("${p} en attente sur le port ${port}...");\n\n`;
                
                const declaredVars = new Set<string>();
                for (let i = 0; i < inEdges.length; i++) {
                    const inEdge = inEdges[i];
                    const payload = getPayloadOfEdge(inEdge, roles);
                    let varDecl = `int ${payload}`;
                    if (declaredVars.has(payload)) {
                        varDecl = `${payload}`;
                    } else {
                        declaredVars.add(payload);
                    }
                    if (inEdge.protocol === 'TCP') {
                        code += `        Socket socket_${i} = serverSocket.accept();\n`;
                        code += `        DataInputStream in_${i} = new DataInputStream(socket_${i}.getInputStream());\n`;
                        code += `        ${varDecl} = in_${i}.readInt();\n`;
                        code += `        in_${i}.close(); socket_${i}.close();\n`;
                        code += `        System.out.println("${p} reçu ${payload} = " + ${payload});\n\n`;
                    } else if (inEdge.protocol === 'UDP') {
                        code += `        byte[] buf_${i} = new byte[1024];\n`;
                        code += `        DatagramPacket pkt_${i} = new DatagramPacket(buf_${i}, buf_${i}.length);\n`;
                        code += `        udpServer.receive(pkt_${i});\n`;
                        code += `        ${varDecl} = Integer.parseInt(new String(pkt_${i}.getData(), 0, pkt_${i}.getLength()).trim());\n`;
                        code += `        System.out.println("${p} reçu ${payload} = " + ${payload});\n\n`;
                    }
                }

                code += getCalculateCode(pRole, p, inEdges, roles, '        ');

                for (const outEdge of outEdges) {
                    const payload = getPayloadOfEdge(outEdge, roles);
                    code += generateSendSnippet(outEdge, '        ', payload, false);
                }
            }
        }
    }

    code += `    }\n`;
    code += `}\n`;
    files[`${p}.java`] = code;
  });

  let readme = `=== INSTRUCTIONS D'EXÉCUTION ===\n\n1. Compilez tous les fichiers :\n   javac *.java\n\n2. Lancez chaque processus (dans des terminaux séparés, dans l'ordre inverse si possible)\n\n   Exemples de commandes de lancement en local :\n`;

  [...processes].reverse().forEach(p => {
     const pOutEdges = edges.filter((e) => e.from === p);
     const destIPs = Array.from(new Set(pOutEdges.map(e => e.to))).sort();
     const args = destIPs.map(() => '127.0.0.1').join(' ');
     readme += `   Terminal pour ${p} : java ${p} ${args}\n`;
  });

  files['README.md'] = readme;

  return files;
}
