import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import flightData from '../data.json';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

interface Flight {
  flight_id: string;
  departureAt: string;
  arrivalAt: string;
  availableSeats: number;
  prices: {
    currency: string;
    adult: number;
    child: number;
  };
}

interface Route {
  route_id: string;
  departureDestination: string;
  arrivalDestination: string;
  itineraries: Flight[];
}

const routes = new Map<string, Route>();
flightData.forEach((route: Route) => {
  routes.set(route.route_id, route);
});


// Endpoint to get all routes
app.get('/routes', (req: Request, res: Response) => {
  const allRoutes = Array.from(routes.values());
  res.json(allRoutes);
});

// Endpoint to get a single route by ID
app.get('/routes/:route_id', (req: Request, res: Response) => {
  const routeId = req.params.route_id;
  const route = routes.get(routeId);
  if (route) {
    res.json(route);
  } else {
    res.status(404).json({ error: 'Route not found' });
  }
});

// Endpoint to get all direct flights between two locations and specified departure/arrival times
app.get('/direct-flights/:departure/:arrival', (req: Request, res: Response) => {
  const departure = req.params.departure;
  const arrival = req.params.arrival;
  const { departureTime, arrivalTime } = req.query;

  const directRoutes = Array.from(routes.values()).filter(
    (route) => route.departureDestination === departure && route.arrivalDestination === arrival
  );

  const directFlightsSet = new Set<Flight>();
  directRoutes.forEach((route) => {
    route.itineraries.forEach((flight) => {
      if (flight.availableSeats > 0) {
        const flightDepartureTime = new Date(flight.departureAt).getTime();
        const flightArrivalTime = new Date(flight.arrivalAt).getTime();
        if (
          (!departureTime || Math.abs(new Date(Date.parse(departureTime as string)).getTime() - flightDepartureTime) <= 86400000) &&
          (!arrivalTime || Math.abs(new Date(Date.parse(arrivalTime as string)).getTime() - flightArrivalTime) <= 86400000)
        ) {
          directFlightsSet.add(flight);
        }
      }
    });
  });

  const directFlights = Array.from(directFlightsSet);

  if (directFlights.length > 0) {
    res.json(directFlights);
  } else {
    res.status(404).json({ error: 'No direct flights available' });
  }
});



// Endpoint to book a flight
app.post('/book', (req: Request, res: Response) => {
  const { name, flightId, numSeats } = req.body;

  let bookedFlight: Flight | undefined;
  let bookedRoute: Route | undefined;
  routes.forEach((route) => {
    route.itineraries.forEach((flight) => {
      if (flight.flight_id === flightId) {
        bookedFlight = flight;
        bookedRoute = route;
      }
    });
  });

  if (!bookedFlight || !bookedRoute) {
    res.status(404).json({ error: 'Flight not found' });
  } else if (bookedFlight.availableSeats < numSeats) {
    res.status(400).json({ error: 'Not enough seats available' });
  } else {
    bookedFlight.availableSeats -= numSeats;
    const totalPrice = numSeats * bookedFlight.prices.adult;
    res.json({
      name,
      flightId,
      numSeats,
      totalPrice,
      departure: bookedRoute.departureDestination,
      arrival: bookedRoute.arrivalDestination,
      departureTime: bookedFlight.departureAt,
      arrivalTime: bookedFlight.arrivalAt,
    });
  }
});

// Endpoint to find connecting flights with specified times
app.get('/connection-flights/:departureDestination/:arrivalDestination', (req: Request, res: Response) => {
  const departureDestination = req.params.departureDestination as string;
  const arrivalDestination = req.params.arrivalDestination as string;
  const departureTime = req.query.departureTime as string; 
  const arrivalTime = req.query.arrivalTime as string; 

  const departingRoutes = Array.from(routes.values()).filter((route) => {
    return route.departureDestination === departureDestination;
  });

  const arrivingRoutes = Array.from(routes.values()).filter((route) => {
    return route.arrivalDestination === arrivalDestination;
  });

  const connectingFlights: {
    departureFlight: Flight;
    arrivalFlight: Flight;
    layoverTime: string;
    route: Route;
  }[] = [];

  departingRoutes.forEach((departingRoute) => {
    arrivingRoutes.forEach((arrivingRoute) => {
      departingRoute.itineraries.forEach((departingFlight) => {
        arrivingRoute.itineraries.forEach((arrivingFlight) => {
          if (
            departingRoute.arrivalDestination === arrivingRoute.departureDestination &&
            departingFlight.arrivalAt <= arrivingFlight.departureAt &&
            (new Date(arrivingFlight.departureAt).getTime() -
              new Date(departingFlight.arrivalAt).getTime()) /
              (1000 * 60 * 60) < 24 &&
            (!departureTime || new Date(departingFlight.departureAt).getTime() <= new Date(departureTime).getTime() + 24 * 60 * 60 * 1000)              
              && 
            (!arrivalTime || arrivingFlight.arrivalAt === arrivalTime) 
          ) {

            const layoverTime =
              (new Date(arrivingFlight.departureAt).getTime() -
                new Date(departingFlight.arrivalAt).getTime()) /
              (1000 * 60 ) + " minutes";

            connectingFlights.push({
              departureFlight: departingFlight,
              arrivalFlight: arrivingFlight,
              layoverTime: layoverTime ,
              route: departingRoute,
            });
          }
        });
      });
    });
  });



  const formattedFlights = connectingFlights.map((flight) => {
    const departureRoute = {
      departureDestination: flight.route.departureDestination,
      arrivalDestination: flight.route.arrivalDestination,
    };
  
    const arrivalRoute = {
      departureDestination: flight.route.arrivalDestination,
      arrivalDestination: arrivalDestination,
    };
  
    return {
      departureFlight: flight.departureFlight,
      arrivalFlight: flight.arrivalFlight,
      layoverTime: flight.layoverTime,
      route: {
        departureRoute,
        arrivalRoute,
      },
    };
  });
  

  res.json(formattedFlights);
});




app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
