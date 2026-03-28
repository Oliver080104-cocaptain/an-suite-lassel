import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse incoming payload
    const payload = await req.json();
    
    // Ensure payload is an array
    const tickets = Array.isArray(payload) ? payload : [payload];
    
    const results = {
      created: [],
      updated: [],
      errors: []
    };

    for (const ticketData of tickets) {
      try {
        // Remove search_index field if present (not part of entity schema)
        const { search_index, ...cleanTicketData } = ticketData;
        
        if (!cleanTicketData.ticketnummer) {
          results.errors.push({
            ticket: ticketData,
            error: 'Ticketnummer ist erforderlich'
          });
          continue;
        }

        // Check if ticket already exists by ticketIdZoho or ticketnummer
        let existingTickets = [];
        
        if (cleanTicketData.ticketIdZoho) {
          existingTickets = await base44.asServiceRole.entities.Ticket.filter({
            ticketIdZoho: cleanTicketData.ticketIdZoho
          });
        }
        
        if (existingTickets.length === 0 && cleanTicketData.ticketnummer) {
          existingTickets = await base44.asServiceRole.entities.Ticket.filter({
            ticketnummer: cleanTicketData.ticketnummer
          });
        }

        if (existingTickets.length > 0) {
          // Update existing ticket
          const existingTicket = existingTickets[0];
          await base44.asServiceRole.entities.Ticket.update(
            existingTicket.id,
            cleanTicketData
          );
          results.updated.push({
            ticketnummer: cleanTicketData.ticketnummer,
            ticketIdZoho: cleanTicketData.ticketIdZoho,
            id: existingTicket.id
          });
        } else {
          // Create new ticket
          const newTicket = await base44.asServiceRole.entities.Ticket.create(
            cleanTicketData
          );
          results.created.push({
            ticketnummer: cleanTicketData.ticketnummer,
            ticketIdZoho: cleanTicketData.ticketIdZoho,
            id: newTicket.id
          });
        }
      } catch (error) {
        results.errors.push({
          ticket: ticketData.ticketnummer || 'unbekannt',
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      message: `${results.created.length} Tickets erstellt, ${results.updated.length} aktualisiert, ${results.errors.length} Fehler`,
      results
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});